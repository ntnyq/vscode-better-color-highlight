import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { ColorDetector, ColorMatch } from '../../../src/engine/detection'
import type { NestedScopedConfigs } from '../../../src/meta'
import type * as LoggerModule from '../../../src/shared/logger'
import { semanticColorFixtures } from '../../fixtures/semantic-colors'

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
  matchAnsiEscapeCodes: false,
  ansiPalette: {},
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
  import('../../../src/shared/logger'),
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
    configSnapshot.useARGB = false
    configSnapshot.matchAnsiEscapeCodes = false
    configSnapshot.ansiPalette = {}
    replace.mockClear()
    loggerError.mockClear()
  })

  it.each([
    [false, '0xFF000080'],
    [true, '0x80FF0000'],
  ])(
    'only offers numeric hex replacements for numeric source (ARGB %s)',
    async (useARGB, expected) => {
      configSnapshot.useARGB = useARGB
      const { provideColorPresentations } =
        await import('../../../src/features/color-provider/document-color-provider')
      const range = { id: 'source-range' } as unknown as Vscode.Range
      const numericDocument = {
        ...document,
        languageId: 'typescript',
        getText: () => '0xFF0000',
      }
      const result = provideColorPresentations(
        new TestColor(1, 0, 0, 0.5) as unknown as Vscode.Color,
        { document: numericDocument, range },
      )
      expect(result.map(item => item.label)).toStrictEqual([expected])
    },
  )

  it.each(semanticColorFixtures)(
    'excludes semantic $languageId ranges from generic color picker edits',
    async ({ text, languageId }) => {
      configSnapshot.enableColorPicker = true
      const { provideDocumentColors } =
        await import('../../../src/features/color-provider/document-color-provider')
      const sourceDocument = {
        ...document,
        languageId,
        uri: { toString: () => `file:///tmp/semantic.${languageId}` },
        getText: () => text,
      } as Vscode.TextDocument
      await expect(
        provideDocumentColors(sourceDocument, activeToken),
      ).resolves.toStrictEqual([])
    },
  )

  it('does not scan when the native picker is disabled or cancelled', async () => {
    const { provideDocumentColors } =
      await import('../../../src/features/color-provider/document-color-provider')

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
      await import('../../../src/features/color-provider/document-color-provider')

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
      await import('../../../src/features/color-provider/document-color-provider')

    const result = await provideDocumentColors(document, activeToken)

    expect(result).toHaveLength(1)
    expect(result[0].range).toStrictEqual(
      new TestRange({ offset: 0 }, { offset: 9 }),
    )
    expect(result[0].color).toStrictEqual(new TestColor(1, 0, 0, 0.502))
  })

  it.each([
    {
      source:
        'rgb(min(var(--cap), 255) max(16, 32) calc(128 / 2) / clamp(0, var(--opacity), 1))',
      expected: new TestColor(128 / 255, 32 / 255, 64 / 255, 0.5),
    },
    {
      source: 'color(srgb calc(var(--cap) / 256) 0 0 / min(var(--opacity), 1))',
      expected: new TestColor(128 / 255, 0, 0, 0.5),
    },
    {
      source: 'color-mix(in srgb, rgb(calc(var(--cap) * 4) 0 0), black)',
      expected: new TestColor(128 / 255, 0, 0, 1),
    },
    {
      source: 'rgb(from rgb(calc(var(--cap) * 4) 0 0) calc(r / 2) g b)',
      expected: new TestColor(128 / 255, 0, 0, 1),
    },
    {
      source:
        'rgb(from var(--brand) min(r, var(--cap)) max(g, 32) clamp(0, calc(b + 64), 255) / clamp(0, var(--opacity), 1))',
      expected: new TestColor(128 / 255, 32 / 255, 64 / 255, 0.5),
    },
    {
      source: 'alpha(from var(--brand) / max(.25, min(alpha, var(--opacity))))',
      expected: new TestColor(1, 0, 0, 0.5),
    },
  ])(
    'returns the complete math expression after resolving CSS variables: $source',
    async ({ source, expected }) => {
      configSnapshot.enableColorPicker = true
      const { provideDocumentColors } =
        await import('../../../src/features/color-provider/document-color-provider')
      const prefix =
        ':root { --brand: #ff0000; --cap: 128; --opacity: .5; }\n/* 🎨 */\n.sample { color: '
      const text = `${prefix}${source}; }`
      const sourceDocument = {
        ...document,
        getText: () => text,
        languageId: 'css',
      }

      const colors = await provideDocumentColors(sourceDocument, activeToken)

      expect(colors).toHaveLength(2)
      expect(colors[1].range).toStrictEqual(
        new TestRange(
          { offset: prefix.length },
          { offset: prefix.length + source.length },
        ),
      )
      expect(colors[1].color).toStrictEqual(expected)
    },
  )

  it.each([
    'rgb(calc(64 + 64) max(16, 32) clamp(0, 64, 255) / min(.5, 1))',
    'hsl(min(.5turn, 200deg) max(50%, 100%) calc(25% + 25%))',
    'color(display-p3 calc(1 / 2) 0 0 / clamp(0, .5, 1))',
    'color-mix(in srgb, rgb(calc(128 * 2) 0 0), blue)',
    'rgb(from rgb(calc(64 * 2) 0 0) calc(r / 2) g b)',
    'rgb(from red min(r, 128) max(g, 32) clamp(0, calc(b + 64), 255))',
    'alpha(from red / clamp(0, min(alpha, .5), 1))',
  ])(
    'replaces the complete math expression in picker edits: %s',
    async source => {
      configSnapshot.enableColorPicker = true
      const { provideDocumentColors, provideColorPresentations } =
        await import('../../../src/features/color-provider/document-color-provider')
      const prefix = '/* 🎨 */ .sample { color: '
      const text = `${prefix}${source}; }`
      const sourceDocument = {
        ...document,
        getText: () => text,
        languageId: 'css',
      }
      const colors = await provideDocumentColors(sourceDocument, activeToken)
      expect(colors).toHaveLength(1)
      const range = colors[0].range
      expect(range).toStrictEqual(
        new TestRange(
          { offset: prefix.length },
          { offset: prefix.length + source.length },
        ),
      )

      const presentations = provideColorPresentations(
        new TestColor(0, 1, 0, 0.5),
        {
          document: { ...sourceDocument, getText: () => source },
          range,
        },
      )

      expect(presentations.map(item => item.label)).toStrictEqual([
        '#00ff0080',
        'rgba(0, 255, 0, 0.5)',
        'hsl(120 100% 50% / 0.5)',
        'oklch(86.6% 0.295 142.5 / 0.5)',
      ])
      expect(replace.mock.calls).toStrictEqual(
        presentations.map(item => [range, item.label]),
      )
    },
  )

  it('passes Tailwind theme settings to native color detectors', async () => {
    configSnapshot.enableColorPicker = true
    configSnapshot.ansiPalette = { red: '#ff0000' }
    configSnapshot.tailwindColorMode = 'v4'
    configSnapshot.tailwindStylesheetPaths = ['theme.css']
    const { provideDocumentColors } =
      await import('../../../src/features/color-provider/document-color-provider')
    const detector = vi.fn<ColorDetector>(() => [])
    const registry = await import('../../../src/engine/detection/registry')
    const strategies = vi
      .spyOn(registry, 'getStrategies')
      .mockReturnValue([detector])

    await provideDocumentColors(document, activeToken)

    expect(detector).toHaveBeenCalledWith(
      '#ff000080',
      expect.objectContaining({
        ansiPalette: { red: '#ff0000' },
        signal: activeToken,
        tailwindColorMode: 'v4',
        tailwindStylesheetPaths: ['theme.css'],
      }),
    )
    strategies.mockRestore()
  })

  it('returns complete Unity constructor ranges only in C# documents', async () => {
    configSnapshot.enableColorPicker = true
    const { provideDocumentColors } =
      await import('../../../src/features/color-provider/document-color-provider')
    const prefix = '// 🎨\nvar tint = '
    const source = 'new UnityEngine.Color(1f, /* #ff0000 */ 0f, 0f, 0.5f)'
    const text = `${prefix}${source};`
    const nativeDocument = {
      ...document,
      getText: () => text,
      languageId: 'csharp',
    }
    const colors = await provideDocumentColors(nativeDocument, activeToken)
    expect(colors).toHaveLength(1)
    expect(colors[0].range).toStrictEqual(
      new TestRange(
        { offset: prefix.length },
        { offset: prefix.length + source.length },
      ),
    )
    expect(colors[0].color).toStrictEqual(new TestColor(1, 0, 0, 0.5))
    const otherLanguageColors = await provideDocumentColors(
      { ...nativeDocument, languageId: 'typescript' },
      activeToken,
    )
    expect(otherLanguageColors).toHaveLength(1)
    expect(otherLanguageColors[0].range).toStrictEqual(
      new TestRange(
        { offset: text.indexOf('#ff0000') },
        { offset: text.indexOf('#ff0000') + 7 },
      ),
    )
  })

  it('keeps fractional Unity picker channels and writes valid C# floats', async () => {
    const { provideColorPresentations } =
      await import('../../../src/features/color-provider/document-color-provider')
    const range = { id: 'source-range' } as unknown as Vscode.Range
    const nativeDocument = {
      ...document,
      getText: () => 'new UnityEngine.Color(1, 0, 0)',
      languageId: 'csharp',
    }
    const presentations = provideColorPresentations(
      new TestColor(0.12345, 0.23456, 0.34567, 0.45678),
      { document: nativeDocument, range },
    )
    expect(presentations.map(presentation => presentation.label)).toStrictEqual(
      ['new UnityEngine.Color(0.12345f, 0.23456f, 0.34567f, 0.45678f)'],
    )
  })

  it('deduplicates matches and skips unsupported resolved colors', async () => {
    const { createColorInformation } =
      await import('../../../src/features/color-provider/document-color-provider')
    const matches: ColorMatch[] = [
      { start: 0, end: 7, color: 'rgb(255, 0, 0)' },
      { start: 0, end: 7, color: 'rgb(255, 0, 0)' },
      { start: 8, end: 12, color: 'unsupported' },
    ]

    expect(createColorInformation(document, matches)).toHaveLength(1)
  })

  it('skips read-only matches in the native color picker', async () => {
    const { createColorInformation } =
      await import('../../../src/features/color-provider/document-color-provider')

    expect(
      createColorInformation(document, [
        {
          color: 'rgb(205, 0, 0)',
          editMode: 'read-only',
          end: 9,
          start: 0,
        },
      ]),
    ).toStrictEqual([])
  })

  it('bounds native color information returned for one document', async () => {
    const { createColorInformation } =
      await import('../../../src/features/color-provider/document-color-provider')
    const matches: ColorMatch[] = Array.from(
      { length: 10_001 },
      (_, index) => ({
        start: index,
        end: index + 1,
        color: 'rgb(255, 0, 0)',
      }),
    )

    expect(createColorInformation(document, matches)).toHaveLength(10_000)
  })

  it('provides four native replacement presentations', async () => {
    const { provideColorPresentations } =
      await import('../../../src/features/color-provider/document-color-provider')
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

  it('uses ARGB byte order for native hex presentations when configured', async () => {
    configSnapshot.useARGB = true
    const { provideColorPresentations } =
      await import('../../../src/features/color-provider/document-color-provider')
    const range = { id: 'source-range' } as unknown as Vscode.Range

    const result = provideColorPresentations(
      new TestColor(1, 0, 0, 0.5) as unknown as Vscode.Color,
      { document, range },
    )

    expect(result[0].label).toBe('#80ff0000')
  })

  it('provides a valid Dart replacement for Dart color constructors', async () => {
    const { provideColorPresentations } =
      await import('../../../src/features/color-provider/document-color-provider')
    const range = { id: 'source-range' } as unknown as Vscode.Range
    const dartDocument = {
      ...document,
      getText: () => 'Color(0xffff0000)',
      languageId: 'dart',
    } as unknown as Vscode.TextDocument

    const result = provideColorPresentations(
      new TestColor(1, 0, 0, 0.5) as unknown as Vscode.Color,
      { document: dartDocument, range },
    )

    expect(result.map(presentation => presentation.label)).toStrictEqual([
      'Color(0x80ff0000)',
    ])

    const fromArgbDocument = {
      ...dartDocument,
      getText: () => 'Color.fromARGB(255, 255, 0, 0)',
    } as unknown as Vscode.TextDocument
    const fromArgbResult = provideColorPresentations(
      new TestColor(1, 0, 0, 0.5) as unknown as Vscode.Color,
      { document: fromArgbDocument, range },
    )

    expect(
      fromArgbResult.map(presentation => presentation.label),
    ).toStrictEqual(['Color.fromARGB(128, 255, 0, 0)'])

    const fromRgbaDocument = {
      ...dartDocument,
      getText: () => 'Color.fromRGBO(255, 0, 0, 1)',
    } as unknown as Vscode.TextDocument
    const fromRgbaResult = provideColorPresentations(
      new TestColor(1, 0, 0, 0.5) as unknown as Vscode.Color,
      { document: fromRgbaDocument, range },
    )

    expect(
      fromRgbaResult.map(presentation => presentation.label),
    ).toStrictEqual(['Color.fromRGBO(255, 0, 0, 0.5)'])

    const fromDocument = {
      ...dartDocument,
      getText: () =>
        'Color.from(alpha: 1, red: 1, green: 0, blue: 0, colorSpace: ColorSpace.sRGB)',
    } as unknown as Vscode.TextDocument
    const fromResult = provideColorPresentations(
      new TestColor(1, 0, 0, 0.5) as unknown as Vscode.Color,
      { document: fromDocument, range },
    )

    expect(fromResult.map(presentation => presentation.label)).toStrictEqual([
      'Color.from(alpha: 0.5, red: 1, green: 0, blue: 0, colorSpace: ColorSpace.sRGB)',
    ])
  })

  it('preserves Android XML and Compose packed ARGB syntax', async () => {
    const { provideColorPresentations } =
      await import('../../../src/features/color-provider/document-color-provider')
    const range = { id: 'source-range' } as unknown as Vscode.Range
    const androidDocument = {
      ...document,
      getText: () => '#ffff0000',
      languageId: 'xml',
      uri: {
        toString: () => 'file:///app/src/main/res/values/colors.xml',
      },
    } as unknown as Vscode.TextDocument

    expect(
      provideColorPresentations(
        new TestColor(1, 0, 0, 0.5) as unknown as Vscode.Color,
        { document: androidDocument, range },
      ).map(presentation => presentation.label),
    ).toStrictEqual(['#80ff0000'])

    const composeDocument = {
      ...document,
      getText: () => 'Color(0xFFFF0000)',
      languageId: 'kotlin',
      uri: { toString: () => 'file:///app/src/main/Brand.kt' },
    } as unknown as Vscode.TextDocument
    expect(
      provideColorPresentations(
        new TestColor(1, 0, 0, 0.5) as unknown as Vscode.Color,
        { document: composeDocument, range },
      ).map(presentation => presentation.label),
    ).toStrictEqual(['Color(0x80FF0000)'])
  })

  it.each([
    ['kotlin', 'Color(255, 0, 0)', 'Color(255, 0, 0, 128)'],
    [
      'csharp',
      'new UnityEngine.Color(1f, 0F, 0f)',
      'new UnityEngine.Color(1f, 0F, 0f, 0.5f)',
    ],
    [
      'csharp',
      'new UnityEngine.Color32(r: 255, /* brand */ g: 0, b: 0, a: 255)',
      'new UnityEngine.Color32(r: 255, /* brand */ g: 0, b: 0, a: 128)',
    ],
    ['java', 'Color.rgb(255, 0, 0)', 'Color.argb(128, 255, 0, 0)'],
    [
      'swift',
      'Color(red: 1, green: 0, blue: 0)',
      'Color(red: 1, green: 0, blue: 0, opacity: 0.5)',
    ],
    [
      'swift',
      'UIColor(red: 1, green: 0, blue: 0, alpha: 1)',
      'UIColor(red: 1, green: 0, blue: 0, alpha: 0.5)',
    ],
  ])(
    'preserves native %s picker syntax',
    async (languageId, source, expected) => {
      const { provideColorPresentations } =
        await import('../../../src/features/color-provider/document-color-provider')
      const range = { id: 'source-range' } as unknown as Vscode.Range
      const nativeDocument = {
        ...document,
        getText: () => source,
        languageId,
      } as unknown as Vscode.TextDocument
      const result = provideColorPresentations(
        new TestColor(1, 0, 0, 0.5) as unknown as Vscode.Color,
        { document: nativeDocument, range },
      )
      expect(result.map(presentation => presentation.label)).toStrictEqual([
        expected,
      ])
    },
  )

  it('preserves floating-point channels in Dart picker presentations', async () => {
    const { provideColorPresentations } =
      await import('../../../src/features/color-provider/document-color-provider')
    const range = { id: 'source-range' } as unknown as Vscode.Range
    const dartDocument = {
      ...document,
      getText: () => 'Color.from(alpha: 1, red: 1, green: 0, blue: 0)',
      languageId: 'dart',
    } as unknown as Vscode.TextDocument

    const result = provideColorPresentations(
      new TestColor(
        0.10123,
        0.20234,
        0.30345,
        0.45678,
      ) as unknown as Vscode.Color,
      { document: dartDocument, range },
    )

    expect(result.map(presentation => presentation.label)).toStrictEqual([
      'Color.from(alpha: 0.45678, red: 0.10123, green: 0.20234, blue: 0.30345)',
    ])
  })
})
