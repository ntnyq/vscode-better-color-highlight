import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type * as HoverModule from '../../../src/features/hover/color-hover'
import type { NestedScopedConfigs } from '../../../src/meta'
import type * as LoggerModule from '../../../src/shared/logger'

const configSnapshot = {
  enable: true,
  enableHover: true,
  languages: ['*'],
  maxFileSize: 1_000_000,
  matchWords: false,
  namedColorMatchMode: 'context',
  tailwindColorMode: 'auto',
  tailwindStylesheetPaths: [],
  resolveScssVariablesAcrossFiles: false,
  scssLoadPaths: [],
  resolveCssVariablesAcrossFiles: false,
  cssVariablePaths: [],
  cssVariableTrustedSelectors: [],
  designTokenJsonMode: 'token-values',
  resolveDesignTokensAcrossFiles: false,
  useARGB: false,
  matchAnsiEscapeCodes: false,
  ansiPalette: {},
  matchRgbWithNoFunction: false,
  rgbWithNoFunctionLanguages: ['*'],
  matchHslWithNoFunction: false,
  hslWithNoFunctionLanguages: ['*'],
} as unknown as NestedScopedConfigs

const disposeProvider = vi.fn<() => void>()
const disposeCloseListener = vi.fn<() => void>()
const registerHoverProvider = vi.fn<
  (selector: string, provider: Vscode.HoverProvider) => Vscode.Disposable
>(() => ({ dispose: disposeProvider }))
const onDidCloseTextDocument = vi.fn<
  (listener: (document: Vscode.TextDocument) => void) => Vscode.Disposable
>(() => ({ dispose: disposeCloseListener }))
const onDeactivate = vi.fn<(handler: () => void) => void>()
const getColorHover = vi
  .fn<typeof HoverModule.getColorHover>()
  .mockResolvedValue(null)

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      defineConfig: () => configSnapshot,
      onDeactivate,
      ref: (value: number) => ({ value }),
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      languages: { registerHoverProvider },
      workspace: { isTrusted: true, onDidCloseTextDocument },
    }) as unknown as Partial<typeof Vscode>,
)

vi.mock(import('../../../src/features/hover/color-hover'), () => ({
  getColorHover,
  buildColorHoverMarkdown: vi.fn<typeof HoverModule.buildColorHoverMarkdown>(),
}))

vi.mock(
  import('../../../src/shared/logger'),
  () =>
    ({
      logger: {
        error: vi.fn<(message?: unknown) => void>(),
        info: vi.fn<(message?: unknown) => void>(),
      },
    }) as unknown as Partial<typeof LoggerModule>,
)

describe('hover match cache signature', () => {
  it('changes with detector configuration', async () => {
    const { createHoverMatchCacheKey } =
      await import('../../../src/features/hover/use-color-hover')
    const createKey = () =>
      createHoverMatchCacheKey('file:///example.html', 1, 'html', 0, true)
    const initial = createKey()

    configSnapshot.tailwindColorMode = 'v4'
    const modeChanged = createKey()
    configSnapshot.tailwindStylesheetPaths = ['theme.css']
    const pathsChanged = createKey()
    configSnapshot.matchAnsiEscapeCodes = true
    const ansiEnabled = createKey()
    configSnapshot.ansiPalette = { red: '#ff0000' }
    const ansiPaletteChanged = createKey()

    expect(modeChanged).not.toBe(initial)
    expect(pathsChanged).not.toBe(modeChanged)
    expect(ansiEnabled).not.toBe(pathsChanged)
    expect(ansiPaletteChanged).not.toBe(ansiEnabled)
  })
})

describe('hover document lifetime', () => {
  it('invalidates reused URI/version entries and isolates late results after close', async () => {
    const { useColorHover } =
      await import('../../../src/features/hover/use-color-hover')
    useColorHover()
    const provider = registerHoverProvider.mock.calls[0][1]
    const closeDocument = onDidCloseTextDocument.mock.calls[0][0]
    const deactivate = onDeactivate.mock.calls[0][0]
    const document = {
      getText: () => '#ff0000',
      languageId: 'plaintext',
      offsetAt: () => 0,
      uri: { toString: () => 'untitled:Untitled-1' },
      version: 2,
    } as unknown as Vscode.TextDocument
    const position = { line: 0, character: 0 } as Vscode.Position
    const token = { isCancellationRequested: false } as Vscode.CancellationToken

    await provider.provideHover(document, position, token)
    const first = getColorHover.mock.calls[0][0]
    expect(first.matchCache).toBeDefined()
    expect(first.matchCacheKey).toBeDefined()
    if (!first.matchCache || !first.matchCacheKey) {
      throw new Error('Expected a document hover cache')
    }
    const oldMatches = [{ start: 0, end: 7, color: 'rgb(255, 0, 0)' }]
    first.matchCache.set(first.matchCacheKey, oldMatches)

    // Closing and reopening an untitled document can reproduce both the URI
    // and version while its text is completely different.
    closeDocument(document)
    const reopened = { ...document, getText: () => 'rgb(0, 255, 0)' }
    await provider.provideHover(reopened, position, token)
    const next = getColorHover.mock.calls[1][0]
    expect(next.matchCacheKey).toBe(first.matchCacheKey)
    expect(next.matchCache?.get(first.matchCacheKey)).toBeUndefined()

    // A detector started before close can finish after the new request.
    first.matchCache.set(first.matchCacheKey, oldMatches)
    await provider.provideHover(reopened, position, token)
    const afterLateResult = getColorHover.mock.calls[2][0]
    expect(afterLateResult.matchCache?.get(first.matchCacheKey)).toBeUndefined()

    deactivate()
    expect(disposeProvider).toHaveBeenCalledTimes(1)
    expect(disposeCloseListener).toHaveBeenCalledTimes(1)
  })
})
