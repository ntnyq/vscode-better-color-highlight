import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'

type CommandHandler = (...args: unknown[]) => unknown
interface MockRange {
  readonly end: { offset: number }
  readonly start: { offset: number }
}

const registeredCommands = new Map<string, CommandHandler>()
const updateConfig = vi.fn<(key: string, value: unknown) => unknown>()
const writeText = vi.fn<(value: string) => Promise<void>>()
const showInformationMessage = vi.fn<(message: string) => unknown>()
let sourceText = '.box { color: #ff0000; }'
const getText = vi.fn<(range?: MockRange) => string>(range => {
  if (!range) {
    return sourceText
  }

  return sourceText.slice(range.start.offset, range.end.offset)
})
const replace = vi.fn<(range: unknown, value: string) => void>()
/* oxlint-disable promise/prefer-await-to-callbacks */
const edit = vi.fn<
  (callback: (builder: { replace: typeof replace }) => void) => boolean
>(callback => {
  callback({ replace })
  return true
})
/* oxlint-enable promise/prefer-await-to-callbacks */
const activeTextEditor = {
  document: {
    getText,
    languageId: 'css',
    offsetAt: () => 16,
    positionAt: (offset: number) => ({ offset }),
    uri: {
      toString: () => 'file:///tmp/example.css',
    },
  },
  edit,
  selection: {
    active: {},
  },
}

const configSnapshot = {
  enable: true,
  enableHover: true,
  languages: ['*'],
  matchWords: false,
  namedColorMatchMode: 'context',
  resolveScssVariablesAcrossFiles: false,
  scssLoadPaths: [],
  resolveCssVariablesAcrossFiles: false,
  cssVariablePaths: [],
  cssVariableTrustedSelectors: [':root', 'html', 'body', ':host'],
  maxFileSize: 1_000_000,
  designTokenJsonMode: 'token-values',
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
  import('reactive-vscode'),
  () =>
    ({
      defineConfig: vi.fn<
        () => typeof configSnapshot & {
          update: typeof updateConfig
        }
      >(() => ({ ...configSnapshot, update: updateConfig })),
      useCommand: vi.fn<(command: string, handler: CommandHandler) => void>(
        (command, handler) => {
          registeredCommands.set(command, handler)
        },
      ),
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      env: {
        clipboard: {
          writeText,
        },
      },
      window: {
        activeTextEditor,
        showInformationMessage,
      },
      Range: class {
        public readonly end: { offset: number }
        public readonly start: { offset: number }

        public constructor(start: { offset: number }, end: { offset: number }) {
          this.start = start
          this.end = end
        }
      },
      workspace: {
        isTrusted: true,
      },
    }) as unknown as Partial<typeof Vscode>,
)

describe('useCommands', () => {
  it('copies hover-provided color values to the clipboard', async () => {
    vi.resetModules()
    registeredCommands.clear()
    writeText.mockClear()
    writeText.mockResolvedValue()

    const { useCommands } = await import('../src/commands')

    useCommands()
    await registeredCommands.get('color-highlight.copyColorAsHex')?.('#ff0000')

    expect(writeText).toHaveBeenCalledWith('#ff0000')
    expect(showInformationMessage).toHaveBeenCalledWith('Copied #ff0000')
  })

  it('copies the active editor color when a copy command has no hover argument', async () => {
    vi.resetModules()
    registeredCommands.clear()
    writeText.mockClear()
    writeText.mockResolvedValue()

    const { useCommands } = await import('../src/commands')

    useCommands()
    await registeredCommands.get('color-highlight.copyColorAsRgb')?.()

    expect(writeText).toHaveBeenCalledWith('rgb(255, 0, 0)')
  })

  it('replaces the active editor color range when original text matches', async () => {
    vi.resetModules()
    registeredCommands.clear()
    edit.mockClear()
    replace.mockClear()
    sourceText = '.box { color: #ff0000; }'

    const { useCommands } = await import('../src/commands')

    useCommands()
    await registeredCommands.get('color-highlight.replaceColorAsRgb')?.({
      originalText: '#ff0000',
      range: { start: 14, end: 21 },
      value: 'rgb(255, 0, 0)',
    })

    expect(replace).toHaveBeenCalledWith(expect.any(Object), 'rgb(255, 0, 0)')
  })

  it('does not replace a stale active editor range', async () => {
    vi.resetModules()
    registeredCommands.clear()
    edit.mockClear()
    replace.mockClear()
    sourceText = '.box { color: #00ff00; }'

    const { useCommands } = await import('../src/commands')

    useCommands()
    await registeredCommands.get('color-highlight.replaceColorAsRgb')?.({
      originalText: '#ff0000',
      range: { start: 14, end: 21 },
      value: 'rgb(255, 0, 0)',
    })

    expect(replace).not.toHaveBeenCalled()
  })

  it('preserves uppercase hex style when replacing as hex', async () => {
    vi.resetModules()
    registeredCommands.clear()
    edit.mockClear()
    replace.mockClear()
    sourceText = '.box { color: #FF0000; }'

    const { useCommands } = await import('../src/commands')

    useCommands()
    await registeredCommands.get('color-highlight.replaceColorAsHex')?.({
      originalText: '#FF0000',
      range: { start: 14, end: 21 },
      value: '#ff0000',
    })

    expect(replace).toHaveBeenCalledWith(expect.any(Object), '#FF0000')
  })

  it('adjusts alpha down and replaces hex with a transparent hex value', async () => {
    vi.resetModules()
    registeredCommands.clear()
    edit.mockClear()
    replace.mockClear()
    sourceText = '.box { color: #ff0000; }'

    const { useCommands } = await import('../src/commands')

    useCommands()
    await registeredCommands.get('color-highlight.adjustColorAlpha')?.({
      delta: -0.1,
      originalColor: 'rgb(255, 0, 0)',
      originalText: '#ff0000',
      range: { start: 14, end: 21 },
    })

    expect(replace).toHaveBeenCalledWith(expect.any(Object), '#ff0000e6')
  })

  it('clamps alpha up to opaque rgb syntax', async () => {
    vi.resetModules()
    registeredCommands.clear()
    edit.mockClear()
    replace.mockClear()
    sourceText = '.box { color: rgba(255, 0, 0, 0.95); }'

    const { useCommands } = await import('../src/commands')

    useCommands()
    await registeredCommands.get('color-highlight.adjustColorAlpha')?.({
      delta: 0.1,
      originalColor: 'rgba(255, 0, 0, 0.95)',
      originalText: 'rgba(255, 0, 0, 0.95)',
      range: { start: 14, end: 35 },
    })

    expect(replace).toHaveBeenCalledWith(expect.any(Object), 'rgb(255, 0, 0)')
  })

  it('adjusts alpha using the original hsl source format', async () => {
    vi.resetModules()
    registeredCommands.clear()
    edit.mockClear()
    replace.mockClear()
    sourceText = '.box { color: hsl(0 100% 50%); }'

    const { useCommands } = await import('../src/commands')

    useCommands()
    await registeredCommands.get('color-highlight.adjustColorAlpha')?.({
      delta: -0.1,
      originalColor: 'rgb(255, 0, 0)',
      originalText: 'hsl(0 100% 50%)',
      range: { start: 14, end: 29 },
    })

    expect(replace).toHaveBeenCalledWith(
      expect.any(Object),
      'hsl(0 100% 50% / 0.9)',
    )
  })
})
