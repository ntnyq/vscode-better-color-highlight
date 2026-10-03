import { defineExtension, nextTick } from 'reactive-vscode'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { ExtensionContext, TextDocument, TextEditor } from 'vscode'
import { useColorDependencyRevision } from '../../src/extension/color-dependency-revision'
import type * as ConfigModule from '../../src/extension/config'
import { config } from '../../src/extension/config'
import { useColorHighlight } from '../../src/features/highlight/use-color-highlight'
import type * as LoggerModule from '../../src/shared/logger'

const harness = vi.hoisted(() => {
  const documentListeners = new Set<
    (event: { document: TextDocument }) => void
  >()
  const editorListeners = new Set<(editors: TextEditor[]) => void>()
  const watchers: {
    pattern: unknown
    dispose: ReturnType<typeof vi.fn>
    change: (uri: { path: string }) => void
  }[] = []
  return { documentListeners, editorListeners, watchers }
})

vi.mock(
  import('vscode'),
  () =>
    ({
      ColorThemeKind: {},
      EventEmitter: vi.fn<() => void>(),
      Uri: { file: (path: string) => ({ path }) },
      chat: {},
      commands: {},
      debug: {},
      env: {},
      extensions: {},
      l10n: {},
      lm: {},
      tasks: {},
      Range: vi.fn<() => void>(),
      RelativePattern: class {
        public readonly base: unknown
        public readonly pattern: string
        public constructor(base: unknown, pattern: string) {
          this.base = base
          this.pattern = pattern
        }
      },
      window: {
        visibleTextEditors: [],
        onDidChangeVisibleTextEditors: (
          listener: (editors: TextEditor[]) => void,
        ) => {
          harness.editorListeners.add(listener)
          return { dispose: () => harness.editorListeners.delete(listener) }
        },
      },
      workspace: {
        isTrusted: true,
        onDidChangeTextDocument: (
          listener: (event: { document: TextDocument }) => void,
        ) => {
          harness.documentListeners.add(listener)
          return { dispose: () => harness.documentListeners.delete(listener) }
        },
        createFileSystemWatcher: (pattern: unknown) => {
          const watcher = {
            pattern,
            dispose: vi.fn<() => void>(),
            change: (_uri: { path: string }) => {},
          }
          harness.watchers.push(watcher)
          return {
            dispose: watcher.dispose,
            onDidChange: (listener: typeof watcher.change) => {
              watcher.change = listener
              return { dispose: vi.fn<() => void>() }
            },
            onDidCreate: () => ({ dispose: vi.fn<() => void>() }),
            onDidDelete: () => ({ dispose: vi.fn<() => void>() }),
          }
        },
      },
    }) as unknown as Partial<typeof Vscode>,
)

vi.mock(import('../../src/extension/config'), async () => {
  const { reactive } = await import('reactive-vscode')
  return {
    config: reactive({
      enable: false,
      debug: false,
      languages: ['*'],
      resolveCssVariablesAcrossFiles: true,
      resolveScssVariablesAcrossFiles: false,
      resolveDesignTokensAcrossFiles: false,
      cssVariablePaths: ['/shared/a.css'],
      scssLoadPaths: [],
      tailwindStylesheetPaths: [],
    }),
  } as unknown as typeof ConfigModule
})

vi.mock(
  import('../../src/shared/logger'),
  () =>
    ({
      logger: { error: vi.fn<() => void>(), info: vi.fn<() => void>() },
    }) as unknown as typeof LoggerModule,
)

const deactivators: (() => Promise<void>)[] = []

describe('color tracking lifecycle with real reactive scopes', () => {
  afterEach(async () => {
    for (const deactivate of deactivators.splice(0)) {
      await deactivate()
    }
    vi.useRealTimers()
  })

  it('releases document listeners whenever an editor is hidden', async () => {
    const extension = defineExtension(() => useColorHighlight())
    deactivators.push(extension.deactivate)
    await extension.activate({} as ExtensionContext)
    const editor = {
      document: {
        getText: () => '',
        languageId: 'css',
        uri: {
          scheme: 'file',
          fsPath: '/tmp/colors.css',
          toString: () => 'file:///tmp/colors.css',
        },
      },
      viewColumn: 1,
      setDecorations: vi.fn<() => void>(),
    } as unknown as TextEditor
    const baseline = harness.documentListeners.size
    for (let index = 0; index < 5; index++) {
      for (const listener of harness.editorListeners) {
        listener([editor])
      }
      await nextTick()
      expect(harness.documentListeners.size).toBe(baseline + 1)
      for (const listener of harness.editorListeners) {
        listener([])
      }
      await nextTick()
      expect(harness.documentListeners.size).toBe(baseline)
    }
    for (const listener of harness.editorListeners) {
      listener([editor])
    }
    await nextTick()
    await extension.deactivate()
    expect(harness.documentListeners.size).toBe(baseline)
  })

  it('rebuilds external watchers after paths or feature flags change', async () => {
    vi.useFakeTimers()
    const revision = useColorDependencyRevision()
    deactivators.push(defineExtension(() => {}).deactivate)
    const oldWatchers = [...harness.watchers]
    expect(oldWatchers.at(-1)?.pattern).toMatchObject({
      base: { path: '/shared' },
      pattern: 'a.css',
    })

    config.cssVariablePaths = ['/shared/b.css']
    await nextTick()
    expect(
      oldWatchers.every(watcher => watcher.dispose.mock.calls.length === 1),
    ).toBe(true)
    const cssWatcher = harness.watchers.at(-1)
    expect(cssWatcher?.pattern).toMatchObject({
      base: { path: '/shared' },
      pattern: 'b.css',
    })
    cssWatcher?.change({ path: '/shared/b.css' })
    await vi.advanceTimersByTimeAsync(100)
    expect(revision.value).toBe(1)

    config.scssLoadPaths = ['/shared/sass']
    config.resolveScssVariablesAcrossFiles = true
    await nextTick()
    expect(harness.watchers.at(-2)?.pattern).toMatchObject({
      base: { path: '/shared/sass' },
    })
    config.tailwindStylesheetPaths = ['/themes/a.css']
    config.tailwindStylesheetPaths = ['/themes/b.css']
    await nextTick()
    expect(harness.watchers.at(-1)?.pattern).toMatchObject({
      base: { path: '/themes' },
      pattern: 'b.css',
    })

    config.resolveCssVariablesAcrossFiles = false
    config.resolveScssVariablesAcrossFiles = false
    config.tailwindStylesheetPaths = []
    await nextTick()
    expect(
      harness.watchers.every(
        watcher => watcher.dispose.mock.calls.length === 1,
      ),
    ).toBe(true)
  })
})
