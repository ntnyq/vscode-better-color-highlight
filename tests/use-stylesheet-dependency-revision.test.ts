import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'

type DisposeFn = () => void

const configSnapshot = {
  resolveCssVariablesAcrossFiles: true,
  resolveScssVariablesAcrossFiles: false,
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

describe('useStylesheetDependencyRevision', () => {
  it('increments for open-document and filesystem stylesheet changes', async () => {
    deactivateHandlers.length = 0
    documentChangeHandler = () => {}
    fileChangeHandler = () => {}
    vi.resetModules()

    const { useStylesheetDependencyRevision } =
      await import('../src/composables/use-stylesheet-dependency-revision')
    const revision = useStylesheetDependencyRevision()

    documentChangeHandler({
      document: {
        uri: { path: '/workspace/tokens.css' },
      },
    })
    fileChangeHandler({ path: '/workspace/tokens.scss' })

    expect(revision.value).toBe(2)
    expect(deactivateHandlers).toHaveLength(1)
  })
})
