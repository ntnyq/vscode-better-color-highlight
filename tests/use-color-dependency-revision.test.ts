import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'

type DisposeFn = () => void

const configSnapshot = {
  resolveCssVariablesAcrossFiles: true,
  resolveScssVariablesAcrossFiles: false,
  resolveDesignTokensAcrossFiles: true,
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
      workspace: {
        createFileSystemWatcher: vi.fn<() => typeof watcher>(() => watcher),
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
  it('increments for enabled stylesheet and token dependency changes', async () => {
    deactivateHandlers.length = 0
    documentChangeHandler = () => {}
    fileChangeHandler = () => {}
    vi.resetModules()

    const { useColorDependencyRevision } =
      await import('../src/composables/use-color-dependency-revision')
    const revision = useColorDependencyRevision()

    documentChangeHandler({ document: { uri: { path: '/tokens.css' } } })
    fileChangeHandler({ path: '/tokens.yaml' })
    fileChangeHandler({ path: '/notes.txt' })

    expect(revision.value).toBe(2)
    expect(deactivateHandlers).toHaveLength(1)
  })

  it('watches CSS dependencies when Tailwind stylesheet paths are configured', async () => {
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

    expect(revision.value).toBe(1)
  })
})
