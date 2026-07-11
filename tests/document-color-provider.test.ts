import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { NestedScopedConfigs } from '../src/meta'
import type { ColorDetector, ColorMatch } from '../src/types'
import type * as LoggerModule from '../src/utils/logger'

class TestColor {
  public readonly red: number

  public readonly green: number

  public readonly blue: number

  public readonly alpha: number

  public constructor(red: number, green: number, blue: number, alpha: number) {
    this.red = red
    this.green = green
    this.blue = blue
    this.alpha = alpha
  }
}

class TestColorInformation {
  public readonly range: unknown

  public readonly color: TestColor

  public constructor(range: unknown, color: TestColor) {
    this.range = range
    this.color = color
  }
}

class TestRange {
  public readonly start: unknown

  public readonly end: unknown

  public constructor(start: unknown, end: unknown) {
    this.start = start
    this.end = end
  }
}

class TestColorPresentation {
  public readonly label: string

  public textEdit: unknown

  public constructor(label: string) {
    this.label = label
  }
}

const replace = vi.fn<
  (range: unknown, newText: string) => { range: unknown; newText: string }
>((range, newText) => ({ range, newText }))
const loggerError = vi.fn<(message: unknown) => void>()
const configSnapshot: NestedScopedConfigs = {
  enable: true,
  enableColorPicker: false,
  enableContrastDiagnostics: false,
  enableColorNavigation: true,
  enableHover: false,
  languages: ['*'],
  matchWords: false,
  namedColorMatchMode: 'context',
  resolveScssVariablesAcrossFiles: false,
  scssLoadPaths: [],
  resolveCssVariablesAcrossFiles: false,
  cssVariablePaths: [],
  cssVariableTrustedSelectors: [':root', 'html', 'body', ':host'],
  maxFileSize: 1_000_000,
  workspacePaletteInclude: '**/*',
  workspacePaletteExclude:
    '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}',
  designTokenJsonMode: 'token-values',
  resolveDesignTokensAcrossFiles: false,
  tailwindColorMode: 'auto',
  tailwindStylesheetPaths: [],
  useARGB: false,
  matchRgbWithNoFunction: false,
  rgbWithNoFunctionLanguages: ['*'],
  matchHslWithNoFunction: false,
  hslWithNoFunctionLanguages: ['*'],
  markerType: 'background',
  markRuler: true,
  debug: false,
}

vi.mock(
  import('vscode'),
  () =>
    ({
      Color: TestColor,
      ColorInformation: TestColorInformation,
      ColorPresentation: TestColorPresentation,
      Range: TestRange,
      TextEdit: { replace },
      workspace: { isTrusted: true },
    }) as unknown as Partial<typeof Vscode>,
)

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      defineConfig: () => configSnapshot,
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('../src/utils/logger'),
  () =>
    ({
      logger: { error: loggerError },
    }) as unknown as typeof LoggerModule,
)

const document = {
  getText: () => '#ff000080',
  languageId: 'plaintext',
  positionAt: (offset: number) => ({ offset }),
  uri: { toString: () => 'file:///tmp/colors.txt' },
} as unknown as Vscode.TextDocument

const activeToken = {
  isCancellationRequested: false,
} as Vscode.CancellationToken
const cancelledToken = {
  isCancellationRequested: true,
} as Vscode.CancellationToken

describe('document color provider', () => {
  beforeEach(() => {
    configSnapshot.enable = true
    configSnapshot.enableColorPicker = false
    configSnapshot.languages = ['*']
    configSnapshot.maxFileSize = 1_000_000
    configSnapshot.tailwindColorMode = 'auto'
    configSnapshot.tailwindStylesheetPaths = []
    replace.mockClear()
    loggerError.mockClear()
  })

  it('does not scan when the native picker is disabled or cancelled', async () => {
    const { provideDocumentColors } =
      await import('../src/color-provider/document-color-provider')

    await expect(
      provideDocumentColors(document, activeToken),
    ).resolves.toStrictEqual([])

    configSnapshot.enableColorPicker = true
    await expect(
      provideDocumentColors(document, cancelledToken),
    ).resolves.toStrictEqual([])
  })

  it('skips excluded languages, oversized text, and late cancellation', async () => {
    configSnapshot.enableColorPicker = true
    const { provideDocumentColors } =
      await import('../src/color-provider/document-color-provider')

    configSnapshot.languages = ['css']
    await expect(
      provideDocumentColors(document, activeToken),
    ).resolves.toStrictEqual([])

    configSnapshot.languages = ['*']
    configSnapshot.maxFileSize = 1
    await expect(
      provideDocumentColors(document, activeToken),
    ).resolves.toStrictEqual([])

    configSnapshot.maxFileSize = 1_000_000
    let cancellationChecks = 0
    const lateCancellationToken = {
      get isCancellationRequested() {
        cancellationChecks++
        return cancellationChecks > 1
      },
    } as Vscode.CancellationToken
    await expect(
      provideDocumentColors(document, lateCancellationToken),
    ).resolves.toStrictEqual([])
  })

  it('maps detected colors to native normalized channels and ranges', async () => {
    configSnapshot.enableColorPicker = true
    const { provideDocumentColors } =
      await import('../src/color-provider/document-color-provider')

    const result = await provideDocumentColors(document, activeToken)

    expect(result).toHaveLength(1)
    expect(result[0].range).toStrictEqual(
      new TestRange({ offset: 0 }, { offset: 9 }),
    )
    expect(result[0].color).toStrictEqual(new TestColor(1, 0, 0, 0.502))
  })

  it('passes Tailwind theme settings to native color detectors', async () => {
    configSnapshot.enableColorPicker = true
    configSnapshot.tailwindColorMode = 'v4'
    configSnapshot.tailwindStylesheetPaths = ['theme.css']
    const { provideDocumentColors } =
      await import('../src/color-provider/document-color-provider')
    const detector = vi.fn<ColorDetector>(() => [])
    const registry = await import('../src/core/strategy-registry')
    const strategies = vi
      .spyOn(registry, 'getStrategies')
      .mockReturnValue([detector])

    await provideDocumentColors(document, activeToken)

    expect(detector).toHaveBeenCalledWith(
      '#ff000080',
      expect.objectContaining({
        tailwindColorMode: 'v4',
        tailwindStylesheetPaths: ['theme.css'],
      }),
    )
    strategies.mockRestore()
  })

  it('deduplicates matches and skips unsupported resolved colors', async () => {
    const { createColorInformation } =
      await import('../src/color-provider/document-color-provider')
    const matches: ColorMatch[] = [
      { start: 0, end: 7, color: 'rgb(255, 0, 0)' },
      { start: 0, end: 7, color: 'rgb(255, 0, 0)' },
      { start: 8, end: 12, color: 'unsupported' },
    ]

    expect(createColorInformation(document, matches)).toHaveLength(1)
  })

  it('provides four native replacement presentations', async () => {
    const { provideColorPresentations } =
      await import('../src/color-provider/document-color-provider')
    const range = { id: 'source-range' } as unknown as Vscode.Range

    const result = provideColorPresentations(
      new TestColor(1, 0, 0, 0.5) as unknown as Vscode.Color,
      { document, range },
    )

    expect(result.map(presentation => presentation.label)).toStrictEqual([
      '#ff000080',
      'rgba(255, 0, 0, 0.5)',
      'hsl(0 100% 50% / 0.5)',
      'oklch(62.8% 0.258 29.2 / 0.5)',
    ])
    expect(replace.mock.calls).toStrictEqual(
      result.map(presentation => [range, presentation.label]),
    )
  })
})
