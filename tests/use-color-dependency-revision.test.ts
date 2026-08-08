import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'

type DisposeFn = () => void

const configSnapshot = {
  resolveCssVariablesAcrossFiles: true,
  resolveScssVariablesAcrossFiles: false,
  resolveDesignTokensAcrossFiles: true,
  cssVariablePaths: [] as string[],
  scssLoadPaths: [] as string[],
  tailwindStylesheetPaths: [] as string[],
}
const deactivateHandlers: DisposeFn[] = []
let documentChangeHandler: (event: unknown) => void = () => {}
let fileChangeHandler: (uri: unknown) => void = () => {}
const watcherDispose = vi.fn<DisposeFn>()
const watcherEventDisposable = () => ({ dispose: vi.fn<DisposeFn>() })
const watcher = {
  dispose: watcherDispose,
  onDidChange: vi.fn<
    (handler: (uri: unknown) => void) => { dispose: DisposeFn }
  >(handler => {
    fileChangeHandler = handler
    return watcherEventDisposable()
  }),
  onDidCreate: vi.fn<
    (handler: (uri: unknown) => void) => { dispose: DisposeFn }
  >(() => watcherEventDisposable()),
  onDidDelete: vi.fn<
    (handler: (uri: unknown) => void) => { dispose: DisposeFn }
  >(() => watcherEventDisposable()),
}
const createFileSystemWatcher = vi.fn<(pattern: unknown) => typeof watcher>(
  () => watcher,
)

class TestRelativePattern {
  public readonly base: unknown

  public readonly pattern: string

  public constructor(base: unknown, pattern: string) {
    this.base = base
    this.pattern = pattern
  }
}

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      defineConfig: vi.fn<() => typeof configSnapshot>(() => configSnapshot),
      onDeactivate: vi.fn<(handler: DisposeFn) => void>(handler => {
        deactivateHandlers.push(handler)
      }),
      ref: <T>(value: T) => ({ value }),
      watch: vi.fn<
        (source: () => boolean, listener: (value: boolean) => void) => DisposeFn
      >((source: () => boolean, listener: (value: boolean) => void) => {
        listener(source())
        return vi.fn<DisposeFn>()
      }),
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      RelativePattern: TestRelativePattern,
      Uri: {
        file: (path: string) => ({ path }),
        parse: (value: string) => ({ path: value }),
      },
      workspace: {
        createFileSystemWatcher,
        onDidChangeTextDocument: vi.fn<
          (handler: (event: unknown) => void) => { dispose: DisposeFn }
        >(handler => {
          documentChangeHandler = handler
          return { dispose: vi.fn<DisposeFn>() }
        }),
      },
    }) as unknown as Partial<typeof Vscode>,
)

describe('useColorDependencyRevision', () => {
  beforeEach(() => {
    configSnapshot.resolveCssVariablesAcrossFiles = true
    configSnapshot.resolveScssVariablesAcrossFiles = false
    configSnapshot.resolveDesignTokensAcrossFiles = true
    configSnapshot.cssVariablePaths = []
    configSnapshot.scssLoadPaths = []
    configSnapshot.tailwindStylesheetPaths = []
    createFileSystemWatcher.mockClear()
  })

  it('coalesces rapid stylesheet and token dependency changes', async () => {
    vi.useFakeTimers()
    deactivateHandlers.length = 0
    documentChangeHandler = () => {}
    fileChangeHandler = () => {}
    vi.resetModules()

    const { useColorDependencyRevision } =
      await import('../src/composables/use-color-dependency-revision')
    const revision = useColorDependencyRevision()

    documentChangeHandler({ document: { uri: { path: '/tokens.css' } } })
    fileChangeHandler({ path: '/tokens.yaml' })
    fileChangeHandler({ path: '/theme.tokens' })
    fileChangeHandler({ path: '/notes.txt' })

    expect(revision.value).toBe(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(revision.value).toBe(1)
    expect(deactivateHandlers).toHaveLength(1)
    vi.useRealTimers()
  })

  it('watches CSS dependencies when Tailwind stylesheet paths are configured', async () => {
    vi.useFakeTimers()
    deactivateHandlers.length = 0
    configSnapshot.resolveCssVariablesAcrossFiles = false
    configSnapshot.resolveDesignTokensAcrossFiles = false
    configSnapshot.tailwindStylesheetPaths = ['theme.css']
    vi.resetModules()

    const { useColorDependencyRevision } =
      await import('../src/composables/use-color-dependency-revision')
    const revision = useColorDependencyRevision()

    fileChangeHandler({ path: '/theme.css' })
    fileChangeHandler({ path: '/tokens.json' })

    await vi.advanceTimersByTimeAsync(100)
    expect(revision.value).toBe(1)
    vi.useRealTimers()
  })

  it('watches absolute Sass load paths outside workspace folders', async () => {
    vi.useFakeTimers()
    configSnapshot.resolveCssVariablesAcrossFiles = false
    configSnapshot.resolveScssVariablesAcrossFiles = true
    configSnapshot.resolveDesignTokensAcrossFiles = false
    configSnapshot.scssLoadPaths = ['/shared/sass']
    vi.resetModules()

    const { useColorDependencyRevision } =
      await import('../src/composables/use-color-dependency-revision')
    const revision = useColorDependencyRevision()

    expect(createFileSystemWatcher).toHaveBeenCalledTimes(2)
    expect(createFileSystemWatcher.mock.calls[1]?.[0]).toMatchObject({
      base: { path: '/shared/sass' },
      pattern: '**/*.{css,json,jsonc,less,sass,scss,tokens,yaml,yml}',
    })

    fileChangeHandler({ path: '/shared/sass/_tokens.scss' })
    await vi.advanceTimersByTimeAsync(100)
    expect(revision.value).toBe(1)
    vi.useRealTimers()
  })

  it('watches absolute configured files and globs outside workspace folders', async () => {
    configSnapshot.resolveCssVariablesAcrossFiles = true
    configSnapshot.resolveDesignTokensAcrossFiles = false
    configSnapshot.cssVariablePaths = ['/shared/tokens.css']
    configSnapshot.tailwindStylesheetPaths = ['/themes/*/theme.css']
    vi.resetModules()

    const { useColorDependencyRevision } =
      await import('../src/composables/use-color-dependency-revision')
    useColorDependencyRevision()

    expect(createFileSystemWatcher).toHaveBeenCalledTimes(3)
    expect(createFileSystemWatcher.mock.calls[1]?.[0]).toMatchObject({
      base: { path: '/shared' },
      pattern: 'tokens.css',
    })
    expect(createFileSystemWatcher.mock.calls[2]?.[0]).toMatchObject({
      base: { path: '/themes' },
      pattern: '*/theme.css',
    })
  })
})
