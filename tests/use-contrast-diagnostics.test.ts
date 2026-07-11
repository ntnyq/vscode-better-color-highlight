import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { ResolvedContrastPair } from '../src/contrast/types'

type DisposeFn = () => void
type EventHandler<T> = (event: T) => void

const collectionSet = vi.fn<(uri: unknown, diagnostics: unknown[]) => void>()
const collectionDelete = vi.fn<(uri: unknown) => void>()
const collectionClear = vi.fn<() => void>()
const collectionDispose = vi.fn<() => void>()
const providerDispose = vi.fn<() => void>()
const listenerDisposes: { mock: { calls: unknown[][] } }[] = []
const cancellationSources: CancellationTokenSource[] = []
const watchers: {
  callback: (value: unknown) => void
  source: () => unknown
  stop: ReturnType<typeof vi.fn>
}[] = []
let deactivate: DisposeFn = () => {}
let openHandler: EventHandler<Vscode.TextDocument> = () => {}
let changeHandler: EventHandler<Vscode.TextDocumentChangeEvent> = () => {}
let closeHandler: EventHandler<Vscode.TextDocument> = () => {}

class Position {
  public readonly character: number
  public readonly line: number
  public constructor(line: number, character: number) {
    this.line = line
    this.character = character
  }
}
class Range {
  public readonly end: Position
  public readonly start: Position
  public constructor(start: Position, end: Position) {
    this.start = start
    this.end = end
  }
}
class Diagnostic {
  public code: string | number | undefined
  public relatedInformation: unknown[] | undefined
  public source: string | undefined
  public readonly message: string
  public readonly range: Range
  public readonly severity: number
  public constructor(range: Range, message: string, severity: number) {
    this.range = range
    this.message = message
    this.severity = severity
  }
}
class Location {
  public readonly range: Range
  public readonly uri: unknown
  public constructor(uri: unknown, range: Range) {
    this.uri = uri
    this.range = range
  }
}
class DiagnosticRelatedInformation {
  public readonly location: Location
  public readonly message: string
  public constructor(location: Location, message: string) {
    this.location = location
    this.message = message
  }
}
class CancellationTokenSource {
  public readonly cancel = vi.fn<() => void>(() => {
    this.token.isCancellationRequested = true
  })
  public readonly dispose = vi.fn<() => void>()
  public readonly token = { isCancellationRequested: false }
  public constructor() {
    cancellationSources.push(this)
  }
}

const config = {
  cssVariablePaths: [],
  cssVariableTrustedSelectors: [':root', 'html', 'body', ':host'],
  designTokenJsonMode: 'token-values',
  enable: true,
  enableContrastDiagnostics: false,
  languages: ['*'],
  matchHslWithNoFunction: false,
  matchRgbWithNoFunction: false,
  matchWords: false,
  maxFileSize: 1_000_000,
  namedColorMatchMode: 'context',
  resolveCssVariablesAcrossFiles: false,
  resolveDesignTokensAcrossFiles: false,
  resolveScssVariablesAcrossFiles: false,
  rgbWithNoFunctionLanguages: ['*'],
  hslWithNoFunctionLanguages: ['*'],
  scssLoadPaths: [],
  tailwindColorMode: 'auto',
  tailwindStylesheetPaths: [],
  useARGB: false,
}

function createDocument(uriValue = 'file:///colors.css', languageId = 'css') {
  const document = {
    getText: vi.fn<() => string>(
      () => '.x { color: #777; background-color: #fff; }',
    ),
    languageId,
    positionAt: (offset: number) => new Position(0, offset),
    uri: {
      scheme: 'file',
      toString: () => uriValue,
    },
    version: 1,
  }
  return document
}

const documents: Vscode.TextDocument[] = []

function eventRegistration<T>(setHandler: (handler: EventHandler<T>) => void) {
  return (handler: EventHandler<T>) => {
    setHandler(handler)
    const dispose = vi.fn<DisposeFn>()
    listenerDisposes.push(dispose)
    return { dispose }
  }
}

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      defineConfig: () => config,
      defineLogger: () => ({
        error: vi.fn<(message: string) => void>(),
        info: vi.fn<(message: string) => void>(),
      }),
      onDeactivate: (handler: DisposeFn) => {
        deactivate = handler
      },
      ref: <T>(value: T) => ({ value }),
      watch: (
        source: () => unknown,
        callback: (value: unknown) => void,
        options?: { immediate?: boolean },
      ) => {
        const stop = vi.fn<DisposeFn>()
        watchers.push({ callback, source, stop })
        if (options?.immediate) {
          /* oxlint-disable-next-line node/callback-return, promise/prefer-await-to-callbacks */
          callback(source())
        }
        return stop
      },
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      CancellationTokenSource,
      CodeAction: vi.fn<() => void>(),
      CodeActionKind: { QuickFix: 'quickfix' },
      Diagnostic,
      DiagnosticRelatedInformation,
      DiagnosticSeverity: { Warning: 1 },
      Location,
      Range,
      languages: {
        createDiagnosticCollection: vi.fn<
          () => {
            clear: typeof collectionClear
            delete: typeof collectionDelete
            dispose: typeof collectionDispose
            set: typeof collectionSet
          }
        >(() => ({
          clear: collectionClear,
          delete: collectionDelete,
          dispose: collectionDispose,
          set: collectionSet,
        })),
        registerCodeActionsProvider: vi.fn<
          () => { dispose: typeof providerDispose }
        >(() => ({ dispose: providerDispose })),
      },
      workspace: {
        get isTrusted() {
          return true
        },
        get textDocuments() {
          return documents
        },
        onDidChangeTextDocument: eventRegistration(handler => {
          changeHandler = handler
        }),
        onDidCloseTextDocument: eventRegistration(handler => {
          closeHandler = handler
        }),
        onDidOpenTextDocument: eventRegistration(handler => {
          openHandler = handler
        }),
      },
    }) as unknown as Partial<typeof Vscode>,
)

const findContrastPairs =
  vi.fn<() => Promise<readonly ResolvedContrastPair[]>>()
vi.mock(import('../src/contrast/find-contrast-pairs'), () => ({
  findContrastPairs,
}))

const lowPair: ResolvedContrastPair = {
  background: {
    color: 'rgb(255, 255, 255)',
    originalText: '#fff',
    range: { start: 36, end: 40 },
  },
  contextKey: 'rule:0',
  foreground: {
    color: 'rgb(119, 119, 119)',
    originalText: '#777',
    range: { start: 12, end: 16 },
  },
  variantKey: '',
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function rerunWatches(): void {
  for (const watcher of watchers) {
    watcher.callback(watcher.source())
  }
}

describe('useContrastDiagnostics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    documents.length = 0
    watchers.length = 0
    listenerDisposes.length = 0
    cancellationSources.length = 0
    config.enable = true
    config.enableContrastDiagnostics = false
    config.languages = ['*']
    config.maxFileSize = 1_000_000
    collectionSet.mockClear()
    collectionDelete.mockClear()
    collectionClear.mockClear()
    collectionDispose.mockClear()
    providerDispose.mockClear()
    findContrastPairs.mockReset()
    findContrastPairs.mockResolvedValue([lowPair])
  })

  it('is off by default and diagnoses existing/opened documents after exactly 200 ms when enabled', async () => {
    const existing = createDocument()
    documents.push(existing as unknown as Vscode.TextDocument)
    const { ref } = await import('reactive-vscode')
    const { useContrastDiagnostics } =
      await import('../src/composables/use-contrast-diagnostics')

    useContrastDiagnostics(ref(0))
    expect(collectionClear).toHaveBeenCalledTimes(1)
    expect(findContrastPairs).not.toHaveBeenCalled()

    config.enableContrastDiagnostics = true
    rerunWatches()
    await vi.advanceTimersByTimeAsync(199)
    expect(findContrastPairs).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(findContrastPairs).toHaveBeenCalledTimes(1)
    expect((findContrastPairs.mock.calls as unknown[][])[0]?.[1]).toMatchObject(
      { signal: cancellationSources[0]?.token },
    )
    expect(collectionSet).toHaveBeenCalledWith(existing.uri, [
      expect.objectContaining({ code: 'low-color-contrast' }),
    ])

    const opened = createDocument('file:///opened.css')
    documents.push(opened as unknown as Vscode.TextDocument)
    openHandler(opened as unknown as Vscode.TextDocument)
    await vi.advanceTimersByTimeAsync(200)
    await flush()
    expect(findContrastPairs).toHaveBeenCalledTimes(2)
  })

  it('cancels an in-flight run when rescheduled without a version change', async () => {
    config.enableContrastDiagnostics = true
    const document = createDocument()
    documents.push(document as unknown as Vscode.TextDocument)
    const deferred = Promise.withResolvers<readonly ResolvedContrastPair[]>()
    findContrastPairs.mockReturnValueOnce(deferred.promise)
    const { ref } = await import('reactive-vscode')
    const { useContrastDiagnostics } =
      await import('../src/composables/use-contrast-diagnostics')
    useContrastDiagnostics(ref(0))

    await vi.advanceTimersByTimeAsync(200)
    changeHandler({ document } as unknown as Vscode.TextDocumentChangeEvent)
    expect(cancellationSources).toHaveLength(1)
    expect(cancellationSources[0].cancel).toHaveBeenCalledTimes(1)
    expect(cancellationSources[0].dispose).toHaveBeenCalledTimes(1)
    deferred.resolve([lowPair])
    await flush()
    expect(collectionSet).not.toHaveBeenCalled()
  })

  it('rejects an in-flight result after a version-only change without cancellation', async () => {
    config.enableContrastDiagnostics = true
    const document = createDocument()
    documents.push(document as unknown as Vscode.TextDocument)
    const deferred = Promise.withResolvers<readonly ResolvedContrastPair[]>()
    findContrastPairs.mockReturnValueOnce(deferred.promise)
    const { ref } = await import('reactive-vscode')
    const { useContrastDiagnostics } =
      await import('../src/composables/use-contrast-diagnostics')
    useContrastDiagnostics(ref(0))

    await vi.advanceTimersByTimeAsync(200)
    document.version = 2
    deferred.resolve([lowPair])
    await flush()

    expect(collectionSet).not.toHaveBeenCalled()
    expect(cancellationSources[0].cancel).not.toHaveBeenCalled()
    expect(cancellationSources[0].dispose).toHaveBeenCalledTimes(1)
  })

  it('cancels an in-flight run when diagnostics are disabled at the same version', async () => {
    config.enableContrastDiagnostics = true
    const document = createDocument()
    documents.push(document as unknown as Vscode.TextDocument)
    const deferred = Promise.withResolvers<readonly ResolvedContrastPair[]>()
    findContrastPairs.mockReturnValueOnce(deferred.promise)
    const { ref } = await import('reactive-vscode')
    const { useContrastDiagnostics } =
      await import('../src/composables/use-contrast-diagnostics')
    useContrastDiagnostics(ref(0))

    await vi.advanceTimersByTimeAsync(200)
    config.enableContrastDiagnostics = false
    rerunWatches()
    expect(cancellationSources[0].cancel).toHaveBeenCalledTimes(1)
    expect(cancellationSources[0].dispose).toHaveBeenCalledTimes(1)
    deferred.resolve([lowPair])
    await flush()

    expect(collectionSet).not.toHaveBeenCalled()
  })

  it('cancels an in-flight run when the same-version document closes', async () => {
    config.enableContrastDiagnostics = true
    const document = createDocument()
    documents.push(document as unknown as Vscode.TextDocument)
    const deferred = Promise.withResolvers<readonly ResolvedContrastPair[]>()
    findContrastPairs.mockReturnValueOnce(deferred.promise)
    const { ref } = await import('reactive-vscode')
    const { useContrastDiagnostics } =
      await import('../src/composables/use-contrast-diagnostics')
    useContrastDiagnostics(ref(0))

    await vi.advanceTimersByTimeAsync(200)
    documents.length = 0
    closeHandler(document as unknown as Vscode.TextDocument)
    expect(cancellationSources[0].cancel).toHaveBeenCalledTimes(1)
    expect(cancellationSources[0].dispose).toHaveBeenCalledTimes(1)
    deferred.resolve([lowPair])
    await flush()

    expect(collectionSet).not.toHaveBeenCalled()
  })

  it('keeps a reopened URI isolated from its cancelled predecessor', async () => {
    config.enableContrastDiagnostics = true
    const closedDocument = createDocument()
    documents.push(closedDocument as unknown as Vscode.TextDocument)
    const oldRun = Promise.withResolvers<readonly ResolvedContrastPair[]>()
    const newRun = Promise.withResolvers<readonly ResolvedContrastPair[]>()
    findContrastPairs
      .mockReturnValueOnce(oldRun.promise)
      .mockReturnValueOnce(newRun.promise)
    const { ref } = await import('reactive-vscode')
    const { useContrastDiagnostics } =
      await import('../src/composables/use-contrast-diagnostics')
    useContrastDiagnostics(ref(0))

    await vi.advanceTimersByTimeAsync(200)
    documents.length = 0
    closeHandler(closedDocument as unknown as Vscode.TextDocument)
    const reopenedDocument = createDocument()
    documents.push(reopenedDocument as unknown as Vscode.TextDocument)
    openHandler(reopenedDocument as unknown as Vscode.TextDocument)
    await vi.advanceTimersByTimeAsync(200)
    expect(cancellationSources).toHaveLength(2)
    const predecessorSource = cancellationSources[0]
    const replacementSource = cancellationSources[1]
    expect(predecessorSource.cancel).toHaveBeenCalledTimes(1)
    expect(predecessorSource.dispose).toHaveBeenCalledTimes(1)

    oldRun.resolve([lowPair])
    await flush()
    expect(collectionSet).not.toHaveBeenCalled()
    expect(replacementSource.cancel).not.toHaveBeenCalled()
    expect(replacementSource.dispose).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    newRun.resolve([lowPair])
    await flush()
    expect(collectionSet).toHaveBeenCalledTimes(1)
    expect(replacementSource.cancel).not.toHaveBeenCalled()
    expect(replacementSource.dispose).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an in-flight run on deactivation at the same version', async () => {
    config.enableContrastDiagnostics = true
    const document = createDocument()
    documents.push(document as unknown as Vscode.TextDocument)
    const deferred = Promise.withResolvers<readonly ResolvedContrastPair[]>()
    findContrastPairs.mockReturnValueOnce(deferred.promise)
    const { ref } = await import('reactive-vscode')
    const { useContrastDiagnostics } =
      await import('../src/composables/use-contrast-diagnostics')
    useContrastDiagnostics(ref(0))

    await vi.advanceTimersByTimeAsync(200)
    deactivate()
    expect(cancellationSources[0].cancel).toHaveBeenCalledTimes(1)
    expect(cancellationSources[0].dispose).toHaveBeenCalledTimes(1)
    deferred.resolve([lowPair])
    await flush()

    expect(collectionSet).not.toHaveBeenCalled()
  })

  it('returns void and releases default-off, gated, closed, and completed resources', async () => {
    const document = createDocument()
    documents.push(document as unknown as Vscode.TextDocument)
    const { ref } = await import('reactive-vscode')
    const { useContrastDiagnostics } =
      await import('../src/composables/use-contrast-diagnostics')
    const result = useContrastDiagnostics(ref(0))

    expect(result).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
    expect(cancellationSources).toHaveLength(0)
    openHandler(document as unknown as Vscode.TextDocument)
    expect(vi.getTimerCount()).toBe(0)
    expect(cancellationSources).toHaveLength(0)
    expect(collectionDelete).toHaveBeenCalledWith(document.uri)

    config.enableContrastDiagnostics = true
    config.languages = ['css']
    document.languageId = 'plaintext'
    rerunWatches()
    expect(vi.getTimerCount()).toBe(0)
    expect(cancellationSources).toHaveLength(0)

    document.languageId = 'css'
    config.languages = ['*']
    rerunWatches()
    expect(vi.getTimerCount()).toBe(1)
    expect(cancellationSources).toHaveLength(0)
    documents.length = 0
    closeHandler(document as unknown as Vscode.TextDocument)
    expect(vi.getTimerCount()).toBe(0)
    expect(cancellationSources).toHaveLength(0)
    expect(collectionDelete).toHaveBeenCalledWith(document.uri)

    documents.push(document as unknown as Vscode.TextDocument)
    openHandler(document as unknown as Vscode.TextDocument)
    await vi.advanceTimersByTimeAsync(200)
    await flush()
    expect(vi.getTimerCount()).toBe(0)
    expect(collectionSet).toHaveBeenCalledTimes(1)
    expect(cancellationSources).toHaveLength(1)
    expect(cancellationSources.at(-1)?.cancel).not.toHaveBeenCalled()
    expect(cancellationSources.at(-1)?.dispose).toHaveBeenCalledTimes(1)
  })

  it('clears language and maximum-size gated documents immediately', async () => {
    config.enableContrastDiagnostics = true
    const document = createDocument()
    documents.push(document as unknown as Vscode.TextDocument)
    const { ref } = await import('reactive-vscode')
    const { useContrastDiagnostics } =
      await import('../src/composables/use-contrast-diagnostics')
    useContrastDiagnostics(ref(0))

    document.languageId = 'plaintext'
    config.languages = ['css']
    changeHandler({ document } as unknown as Vscode.TextDocumentChangeEvent)
    expect(collectionDelete).toHaveBeenCalledWith(document.uri)
    await vi.advanceTimersByTimeAsync(200)
    expect(findContrastPairs).not.toHaveBeenCalled()

    document.languageId = 'css'
    config.languages = ['*']
    config.maxFileSize = 1
    changeHandler({ document } as unknown as Vscode.TextDocumentChangeEvent)
    expect(collectionDelete).toHaveBeenCalledWith(document.uri)
    await vi.advanceTimersByTimeAsync(200)
    expect(findContrastPairs).not.toHaveBeenCalled()

    config.enableContrastDiagnostics = false
    rerunWatches()
    expect(collectionClear).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(cancellationSources).toHaveLength(0)
  })

  it('reruns on dependency changes, isolates errors, clears closes, and disposes every resource', async () => {
    config.enableContrastDiagnostics = true
    const first = createDocument('file:///first.css')
    const second = createDocument('file:///second.css')
    documents.push(
      first as unknown as Vscode.TextDocument,
      second as unknown as Vscode.TextDocument,
    )
    findContrastPairs
      .mockRejectedValueOnce(new Error('bad document'))
      .mockResolvedValueOnce([lowPair])
    const { ref } = await import('reactive-vscode')
    const dependencyRevision = ref(0)
    const { useContrastDiagnostics } =
      await import('../src/composables/use-contrast-diagnostics')
    useContrastDiagnostics(dependencyRevision)

    await vi.advanceTimersByTimeAsync(200)
    await flush()
    expect(collectionDelete).toHaveBeenCalledWith(first.uri)
    expect(collectionSet).toHaveBeenCalledWith(second.uri, expect.any(Array))

    dependencyRevision.value++
    rerunWatches()
    await vi.advanceTimersByTimeAsync(200)
    await flush()
    expect(findContrastPairs).toHaveBeenCalledTimes(4)

    closeHandler(second as unknown as Vscode.TextDocument)
    expect(collectionDelete).toHaveBeenCalledWith(second.uri)
    deactivate()
    expect(collectionDispose).toHaveBeenCalledTimes(1)
    expect(providerDispose).toHaveBeenCalledTimes(1)
    expect(
      listenerDisposes.every(dispose => dispose.mock.calls.length === 1),
    ).toBe(true)
    expect(
      watchers.every(watcher => watcher.stop.mock.calls.length === 1),
    ).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
