import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type * as StrategyRegistry from '../src/core/strategy-registry'
import type { ColorMatch } from '../src/types'
import { shouldTrackDocument } from '../src/utils/editor-filter'
import type * as LoggerModule from '../src/utils/logger'

interface TestRef<T> {
  value: T
  watchers: Set<(value: T) => void>
}

type DisposeFn = () => void
type LoggerFn = (message?: unknown) => void

let documentTextRef: TestRef<string>
let visibleEditorsRef: TestRef<unknown[]>
let configSnapshot: Record<string, unknown>

const getterWatchers = new Set<() => void>()

const setDecorations =
  vi.fn<(decorationType: unknown, ranges: unknown[]) => void>()
const onDeactivateMock = vi.fn<(dispose: DisposeFn) => void>()
const createTextEditorDecorationType = vi.fn<() => { dispose: DisposeFn }>(
  () => ({
    dispose: vi.fn<DisposeFn>(),
  }),
)
const asyncStrategy = vi.fn<() => Promise<ColorMatch[]>>()

function createRef<T>(initialValue: T): TestRef<T> {
  let value = initialValue
  const watchers = new Set<(nextValue: T) => void>()

  return {
    get value() {
      return value
    },
    set value(nextValue) {
      value = nextValue
      for (const watcher of watchers) {
        watcher(nextValue)
      }
      triggerGetterWatchers()
    },
    watchers,
  }
}

function isTestRef<T>(source: TestRef<T> | (() => T)): source is TestRef<T> {
  return typeof source !== 'function'
}

function triggerGetterWatchers() {
  for (const watcher of getterWatchers) {
    watcher()
  }
}

function watchRef<T>(
  source: TestRef<T> | (() => T),
  listener: (value: T) => void,
  options?: { immediate?: boolean },
): DisposeFn {
  if (!isTestRef(source)) {
    const watcher = () => listener(source())
    getterWatchers.add(watcher)
    if (options?.immediate) {
      watcher()
    }
    return () => {
      getterWatchers.delete(watcher)
    }
  }

  source.watchers.add(listener)
  if (options?.immediate) {
    listener(source.value)
  }
  return () => {
    source.watchers.delete(listener)
  }
}

vi.mock(
  import('vscode'),
  () =>
    ({
      Range: class Range {
        public readonly start: unknown

        public readonly end: unknown

        public constructor(start: unknown, end: unknown) {
          this.start = start
          this.end = end
        }
      },
      window: {
        createTextEditorDecorationType,
      },
    }) as unknown as Partial<typeof Vscode>,
)

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      defineConfig: vi.fn<() => Record<string, unknown>>(() => configSnapshot),
      onDeactivate: onDeactivateMock,
      ref: createRef,
      useDocumentText: vi.fn<() => TestRef<string>>(() => documentTextRef),
      useVisibleTextEditors: vi.fn<() => TestRef<unknown[]>>(
        () => visibleEditorsRef,
      ),
      watch: vi.fn<typeof watchRef>(watchRef),
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(import('../src/core/strategy-registry'), async importOriginal => {
  const original = await importOriginal<typeof StrategyRegistry>()

  return {
    ...original,
    getStrategies: vi.fn<() => [typeof asyncStrategy]>(() => [asyncStrategy]),
  }
})

vi.mock(
  import('../src/utils/logger'),
  () =>
    ({
      logger: {
        error: vi.fn<LoggerFn>(),
        info: vi.fn<LoggerFn>(),
      },
    }) as unknown as Partial<typeof LoggerModule>,
)

function createDocument(scheme: string) {
  return {
    uri: {
      scheme,
    },
  } as Parameters<typeof shouldTrackDocument>[0]
}

function createEditor() {
  return {
    document: {
      languageId: 'css',
      uri: {
        fsPath: '/tmp/example.css',
        scheme: 'file',
        toString: () => 'file:///tmp/example.css',
      },
      positionAt: (offset: number) => ({ offset }),
    },
    setDecorations,
    viewColumn: 1,
  }
}

function setupTest() {
  vi.clearAllMocks()
  vi.resetModules()
  getterWatchers.clear()
  configSnapshot = {
    enable: true,
    languages: ['*'],
    matchWords: false,
    namedColorMatchMode: 'context',
    resolveScssVariablesAcrossFiles: false,
    scssLoadPaths: [],
    useARGB: false,
    matchRgbWithNoFunction: false,
    rgbWithNoFunctionLanguages: ['*'],
    matchHslWithNoFunction: false,
    hslWithNoFunctionLanguages: ['*'],
    markerType: 'background',
    markRuler: true,
    debug: false,
  }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe(shouldTrackDocument, () => {
  it('tracks regular editable documents', () => {
    expect(shouldTrackDocument(createDocument('file'))).toBe(true)
    expect(shouldTrackDocument(createDocument('untitled'))).toBe(true)
    expect(shouldTrackDocument(createDocument('vscode-remote'))).toBe(true)
  })

  it('excludes output and debug-like documents', () => {
    expect(shouldTrackDocument(createDocument('output'))).toBe(false)
    expect(shouldTrackDocument(createDocument('debug-console'))).toBe(false)
    expect(shouldTrackDocument(createDocument('vscode-terminal'))).toBe(false)
  })
})

describe('useColorHighlight', () => {
  it('discards async results from stale runs after text is cleared', async () => {
    setupTest()
    vi.useFakeTimers()

    const { promise, resolve } = Promise.withResolvers<ColorMatch[]>()
    asyncStrategy.mockReturnValue(promise)

    const editor = createEditor()

    documentTextRef = createRef('.box { color: #ff0000; }')
    visibleEditorsRef = createRef<unknown[]>([editor])

    const { useColorHighlight } =
      await import('../src/composables/use-color-highlight')

    useColorHighlight()
    const strategyCalls = asyncStrategy.mock.calls
    expect(strategyCalls).toHaveLength(1)

    documentTextRef.value = ''
    await vi.advanceTimersByTimeAsync(100)

    resolve([{ start: 14, end: 21, color: 'rgb(255, 0, 0)' }])
    await vi.runAllTimersAsync()

    expect(createTextEditorDecorationType).not.toHaveBeenCalled()
    expect(setDecorations).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('clears decorations when highlighting is disabled without editing text', async () => {
    setupTest()
    vi.useFakeTimers()
    asyncStrategy.mockResolvedValue([
      { start: 14, end: 21, color: 'rgb(255, 0, 0)' },
    ])

    const editor = createEditor()
    documentTextRef = createRef('.box { color: #ff0000; }')
    visibleEditorsRef = createRef<unknown[]>([editor])

    const { useColorHighlight } =
      await import('../src/composables/use-color-highlight')

    useColorHighlight()
    await vi.runAllTimersAsync()

    expect(setDecorations).toHaveBeenLastCalledWith(expect.anything(), [
      expect.anything(),
    ])

    configSnapshot.enable = false
    triggerGetterWatchers()
    await vi.runAllTimersAsync()

    expect(setDecorations).toHaveBeenLastCalledWith(expect.anything(), [])
    vi.useRealTimers()
  })

  it('disposes document text watcher when editor is no longer visible', async () => {
    setupTest()
    const editor = createEditor()
    documentTextRef = createRef('.box { color: #ff0000; }')
    visibleEditorsRef = createRef<unknown[]>([editor])

    const { useColorHighlight } =
      await import('../src/composables/use-color-highlight')

    useColorHighlight()
    expect(documentTextRef.watchers.size).toBe(1)

    visibleEditorsRef.value = []

    expect(documentTextRef.watchers.size).toBe(0)
  })

  it('registers only one extension deactivate handler', async () => {
    setupTest()
    const editor = createEditor()
    documentTextRef = createRef('.box { color: #ff0000; }')
    visibleEditorsRef = createRef<unknown[]>([editor])

    const { useColorHighlight } =
      await import('../src/composables/use-color-highlight')

    useColorHighlight()

    expect(onDeactivateMock.mock.calls).toStrictEqual([[expect.any(Function)]])
  })

  it('passes CSS variable resolver settings to strategies', async () => {
    setupTest()
    asyncStrategy.mockResolvedValue([])
    documentTextRef = createRef('.box { color: var(--brand); }')
    configSnapshot.resolveCssVariablesAcrossFiles = true
    configSnapshot.cssVariablePaths = ['src/styles/tokens.css']
    configSnapshot.cssVariableTrustedSelectors = [':root', '[data-theme=light]']
    visibleEditorsRef = createRef<unknown[]>([createEditor()])

    const { useColorHighlight } =
      await import('../src/composables/use-color-highlight')
    useColorHighlight()

    await flushPromises()

    expect(asyncStrategy).toHaveBeenCalledWith(
      '.box { color: var(--brand); }',
      expect.objectContaining({
        resolveCssVariablesAcrossFiles: true,
        cssVariablePaths: ['src/styles/tokens.css'],
        cssVariableTrustedSelectors: [':root', '[data-theme=light]'],
      }),
    )
  })
})
