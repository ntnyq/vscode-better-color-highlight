import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { shouldTrackDocument } from '../src/core/editor-filter'
import type * as StrategyRegistry from '../src/core/strategy-registry'
import type { ColorMatch } from '../src/core/types'
import type * as LoggerModule from '../src/utils/logger'

interface TestRef<T> {
  value: T
  watchers: Set<(value: T) => void>
}

type DisposeFn = () => void
type LoggerFn = (message?: unknown) => void

let documentTextRef: TestRef<string>
let visibleEditorsRef: TestRef<unknown[]>

const setDecorations =
  vi.fn<(decorationType: unknown, ranges: unknown[]) => void>()
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
    },
    watchers,
  }
}

function watchRef<T>(
  source: TestRef<T>,
  listener: (value: T) => void,
  options?: { immediate?: boolean },
): DisposeFn {
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
      defineConfig: vi.fn<() => Record<string, unknown>>(() => ({
        enable: true,
        languages: ['*'],
        matchWords: false,
        useARGB: false,
        matchRgbWithNoFunction: false,
        rgbWithNoFunctionLanguages: ['*'],
        matchHslWithNoFunction: false,
        hslWithNoFunctionLanguages: ['*'],
        markerType: 'background',
        markRuler: true,
        debug: false,
      })),
      onDeactivate: vi.fn<(dispose: DisposeFn) => void>(),
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
    vi.clearAllMocks()
    vi.useFakeTimers()

    const { promise, resolve } = Promise.withResolvers<ColorMatch[]>()
    asyncStrategy.mockReturnValue(promise)

    const editor = {
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
})
