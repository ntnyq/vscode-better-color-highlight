import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type * as ResolverModule from '../src/color-navigation/resolve-color-definition'
import type { NestedScopedConfigs } from '../src/meta'
import type * as LoggerModule from '../src/utils/logger'

class TestRange {
  public readonly start: unknown
  public readonly end: unknown

  public constructor(start: unknown, end: unknown) {
    this.start = start
    this.end = end
  }
}

class TestUri {
  private readonly value: string

  public constructor(value: string) {
    this.value = value
  }
  public static file(value: string) {
    return new TestUri(`file://${value}`)
  }
  public static parse(value: string) {
    return new TestUri(value)
  }
  public toString() {
    return this.value
  }
}

const loggerError = vi.fn<(message: unknown) => void>()
const resolveColorDefinition =
  vi.fn<typeof ResolverModule.resolveColorDefinition>()
const openTextDocument = vi.fn<(uri: unknown) => Promise<Vscode.TextDocument>>()
const workspaceMock = { isTrusted: true, openTextDocument }
const configSnapshot: NestedScopedConfigs = {
  enable: true,
  enableColorNavigation: true,
  enableColorPicker: false,
  enableContrastDiagnostics: false,
  enableHover: false,
  languages: ['*'],
  matchWords: false,
  maxFileSize: 1_000_000,
  workspacePaletteInclude: '**/*',
  workspacePaletteExclude:
    '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}',
  namedColorMatchMode: 'context',
  tailwindColorMode: 'auto',
  tailwindStylesheetPaths: [],
  resolveScssVariablesAcrossFiles: false,
  scssLoadPaths: [],
  resolveCssVariablesAcrossFiles: false,
  cssVariablePaths: [],
  cssVariableTrustedSelectors: [':root', 'html', 'body', ':host'],
  designTokenJsonMode: 'token-values',
  resolveDesignTokensAcrossFiles: false,
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
      Range: TestRange,
      Uri: TestUri,
      workspace: workspaceMock,
    }) as unknown as Partial<typeof Vscode>,
)
vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      defineConfig: () => configSnapshot,
    }) as unknown as Partial<typeof ReactiveVscode>,
)
vi.mock(import('../src/color-navigation/resolve-color-definition'), () => ({
  resolveColorDefinition,
}))
vi.mock(
  import('../src/utils/logger'),
  () =>
    ({
      logger: { error: loggerError },
    }) as unknown as typeof LoggerModule,
)

function createDocument(
  uri = 'file:///workspace/source.css',
  text = '0123456789',
  languageId = 'css',
) {
  return {
    getText: () => text,
    languageId,
    offsetAt: ({ offset }: { offset: number }) => offset,
    positionAt: (offset: number) => ({ offset }),
    uri: new TestUri(uri),
  } as unknown as Vscode.TextDocument
}

const activeToken = {
  isCancellationRequested: false,
} as Vscode.CancellationToken

describe('provideColorDefinition', () => {
  beforeEach(() => {
    configSnapshot.enable = true
    configSnapshot.enableColorNavigation = true
    configSnapshot.languages = ['*']
    configSnapshot.maxFileSize = 1_000_000
    configSnapshot.tailwindColorMode = 'auto'
    configSnapshot.tailwindStylesheetPaths = []
    workspaceMock.isTrusted = true
    resolveColorDefinition.mockReset()
    openTextDocument.mockReset()
    loggerError.mockReset()
  })

  it('honors enable, navigation, language, size, trust, and early cancellation gates', async () => {
    const { provideColorDefinition } =
      await import('../src/color-navigation/definition-provider')
    const document = createDocument()

    for (const mutate of [
      () => (configSnapshot.enable = false),
      () => (configSnapshot.enableColorNavigation = false),
      () => (configSnapshot.languages = ['json']),
      () => (configSnapshot.maxFileSize = 1),
    ]) {
      mutate()
      await expect(
        provideColorDefinition(document, { offset: 4 } as never, activeToken),
      ).resolves.toBeUndefined()
      configSnapshot.enable = true
      configSnapshot.enableColorNavigation = true
      configSnapshot.languages = ['*']
      configSnapshot.maxFileSize = 1_000_000
      workspaceMock.isTrusted = true
    }
    await expect(
      provideColorDefinition(
        document,
        { offset: 4 } as never,
        {
          isCancellationRequested: true,
        } as Vscode.CancellationToken,
      ),
    ).resolves.toBeUndefined()
    expect(resolveColorDefinition).not.toHaveBeenCalled()
  })

  it('passes workspace trust and the complete strategy context', async () => {
    workspaceMock.isTrusted = false
    configSnapshot.tailwindColorMode = 'v4'
    configSnapshot.tailwindStylesheetPaths = ['theme.css']
    resolveColorDefinition.mockResolvedValue(null)
    const { provideColorDefinition } =
      await import('../src/color-navigation/definition-provider')

    await provideColorDefinition(
      createDocument(),
      { offset: 4 } as never,
      activeToken,
    )

    expect(resolveColorDefinition).toHaveBeenCalledWith(
      '0123456789',
      4,
      expect.objectContaining({
        filePath: 'file:///workspace/source.css',
        languageId: 'css',
        signal: activeToken,
        tailwindColorMode: 'v4',
        tailwindStylesheetPaths: ['theme.css'],
        workspaceIsTrusted: false,
      }),
    )
  })

  it.each([
    'sass',
    'styl',
    'html',
    'javascriptreact',
    'typescriptreact',
    'vue',
    'svelte',
    'astro',
    'templating-language',
  ])('allows enabled %s documents to reach navigation', async languageId => {
    resolveColorDefinition.mockResolvedValue(null)
    const { provideColorDefinition } =
      await import('../src/color-navigation/definition-provider')

    await provideColorDefinition(
      createDocument(
        `file:///workspace/source.${languageId}`,
        'class="bg-brand"',
        languageId,
      ),
      { offset: 10 } as never,
      activeToken,
    )

    expect(resolveColorDefinition).toHaveBeenCalledWith(
      'class="bg-brand"',
      10,
      expect.objectContaining({ languageId }),
    )
  })

  it('rejects a runtime-disabled arbitrary language', async () => {
    configSnapshot.languages = ['*', '!templating-language']
    const { provideColorDefinition } =
      await import('../src/color-navigation/definition-provider')

    await expect(
      provideColorDefinition(
        createDocument(
          'file:///workspace/source.custom',
          'class="bg-brand"',
          'templating-language',
        ),
        { offset: 10 } as never,
        activeToken,
      ),
    ).resolves.toBeUndefined()
    expect(resolveColorDefinition).not.toHaveBeenCalled()
  })

  it('creates precise same-file links without reopening the document', async () => {
    resolveColorDefinition.mockResolvedValue({
      originRange: { start: 2, end: 5 },
      targetFilePath: 'file:///workspace/source.css',
      targetRange: { start: 6, end: 10 },
      targetSelectionRange: { start: 6, end: 8 },
    })
    const { provideColorDefinition } =
      await import('../src/color-navigation/definition-provider')

    const result = await provideColorDefinition(
      createDocument(),
      { offset: 3 } as never,
      activeToken,
    )

    expect(result).toStrictEqual([
      {
        originSelectionRange: new TestRange({ offset: 2 }, { offset: 5 }),
        targetUri: new TestUri('file:///workspace/source.css'),
        targetRange: new TestRange({ offset: 6 }, { offset: 10 }),
        targetSelectionRange: new TestRange({ offset: 6 }, { offset: 8 }),
      },
    ])
    expect(openTextDocument).not.toHaveBeenCalled()
  })

  it('opens cross-file targets and honors late cancellation', async () => {
    resolveColorDefinition.mockResolvedValue({
      originRange: { start: 2, end: 5 },
      targetFilePath: 'file:///workspace/tokens.css',
      targetRange: { start: 1, end: 7 },
      targetSelectionRange: { start: 1, end: 4 },
    })
    const target = createDocument('file:///workspace/tokens.css')
    openTextDocument.mockResolvedValue(target)
    const { provideColorDefinition } =
      await import('../src/color-navigation/definition-provider')

    const result = await provideColorDefinition(
      createDocument(),
      { offset: 3 } as never,
      activeToken,
    )
    expect(result?.[0].targetSelectionRange).toStrictEqual(
      new TestRange({ offset: 1 }, { offset: 4 }),
    )
    expect(openTextDocument).toHaveBeenCalledTimes(1)

    let checks = 0
    await expect(
      provideColorDefinition(
        createDocument(),
        { offset: 3 } as never,
        {
          get isCancellationRequested() {
            return ++checks > 1
          },
        } as Vscode.CancellationToken,
      ),
    ).resolves.toBeUndefined()
  })

  it('honors cancellation after asynchronous Tailwind resolution', async () => {
    let cancelled = false
    resolveColorDefinition.mockImplementationOnce(() => {
      cancelled = true
      return Promise.resolve({
        originRange: { start: 2, end: 5 },
        targetFilePath: 'file:///workspace/theme.css',
        targetRange: { start: 1, end: 7 },
        targetSelectionRange: { start: 1, end: 4 },
      })
    })
    const { provideColorDefinition } =
      await import('../src/color-navigation/definition-provider')

    await expect(
      provideColorDefinition(
        createDocument('file:///workspace/page.html', 'class="bg-brand"'),
        { offset: 10 } as never,
        {
          get isCancellationRequested() {
            return cancelled
          },
        } as Vscode.CancellationToken,
      ),
    ).resolves.toBeUndefined()
    expect(openTextDocument).not.toHaveBeenCalled()
  })

  it('isolates resolver and target-open failures with logging', async () => {
    const { provideColorDefinition } =
      await import('../src/color-navigation/definition-provider')
    resolveColorDefinition.mockRejectedValueOnce(new Error('resolver failed'))
    await expect(
      provideColorDefinition(
        createDocument(),
        { offset: 3 } as never,
        activeToken,
      ),
    ).resolves.toBeUndefined()

    resolveColorDefinition.mockResolvedValueOnce({
      originRange: { start: 2, end: 5 },
      targetFilePath: 'file:///workspace/missing.css',
      targetRange: { start: 1, end: 7 },
      targetSelectionRange: { start: 1, end: 4 },
    })
    openTextDocument.mockRejectedValueOnce(new Error('open failed'))
    await expect(
      provideColorDefinition(
        createDocument(),
        { offset: 3 } as never,
        activeToken,
      ),
    ).resolves.toBeUndefined()
    expect(loggerError).toHaveBeenCalledTimes(2)
  })
})
