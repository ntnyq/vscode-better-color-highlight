import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
const showWarningMessage = vi.fn<(message: string) => unknown>()
const executeCommand =
  vi.fn<(command: string, ...args: unknown[]) => Promise<unknown>>()
const revealRange = vi.fn<(range: unknown) => void>()
const shownEditor = { revealRange, selection: undefined as unknown }
const showTextDocument = vi.fn<() => Promise<typeof shownEditor>>()
const updateWorkspaceConfig =
  vi.fn<(key: string, value: unknown, target: unknown) => Promise<void>>()
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
    positionAt: (offset: number) => ({ character: offset, line: 0, offset }),
    uri: {
      toString: () => 'file:///tmp/example.css',
    },
    version: 4,
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
      defineLogger: vi.fn<
        () => {
          error: ReturnType<typeof vi.fn<(message: string) => void>>
          info: ReturnType<typeof vi.fn<(message: string) => void>>
        }
      >(() => ({
        error: vi.fn<(message: string) => void>(),
        info: vi.fn<(message: string) => void>(),
      })),
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
      commands: { executeCommand },
      ConfigurationTarget: { Workspace: 2 },
      ProgressLocation: { Notification: 15 },
      QuickInputButtons: { Back: {} },
      Selection: class {
        public readonly end: unknown
        public readonly start: unknown
        public constructor(start: unknown, end: unknown) {
          this.start = start
          this.end = end
        }
      },
      ThemeIcon: class {
        public readonly id: string
        public constructor(id: string) {
          this.id = id
        }
      },
      Uri: { parse: (value: string) => ({ toString: () => value }) },
      window: {
        activeTextEditor,
        showInformationMessage,
        showTextDocument,
        showWarningMessage,
      },
      Range: class {
        public readonly end: { offset: number }
        public readonly start: { offset: number }

        public constructor(
          start: { offset: number } | number,
          end: { offset: number } | number,
          endLine?: number,
          endCharacter?: number,
        ) {
          this.start =
            typeof start === 'number'
              ? ({ character: end, line: start, offset: end } as never)
              : start
          this.end =
            typeof start === 'number'
              ? ({
                  character: endCharacter,
                  line: endLine,
                  offset: endCharacter,
                } as never)
              : (end as { offset: number })
        }
      },
      workspace: {
        getConfiguration: () => ({ update: updateWorkspaceConfig }),
        isTrusted: true,
        openTextDocument: vi.fn<
          () => Promise<typeof activeTextEditor.document>
        >(() => Promise.resolve(activeTextEditor.document)),
      },
    }) as unknown as Partial<typeof Vscode>,
)

describe('useCommands', () => {
  beforeEach(() => {
    sourceText = '.box { color: #ff0000; }'
  })
  it('registers the workspace palette and contrast commands', async () => {
    vi.resetModules()
    registeredCommands.clear()

    const { useCommands } = await import('../src/commands')

    useCommands()

    expect(registeredCommands.has('color-highlight.showWorkspacePalette')).toBe(
      true,
    )
    expect(registeredCommands.has('color-highlight.checkColorContrast')).toBe(
      true,
    )
    expect(
      registeredCommands.has('color-highlight.internal.checkContrastPair'),
    ).toBe(true)
    expect(
      registeredCommands.has(
        'color-highlight.internal.disableContrastDiagnostics',
      ),
    ).toBe(true)
  })

  it('validates URI, version, range, and source text before diagnostic actions', async () => {
    vi.resetModules()
    registeredCommands.clear()
    executeCommand.mockClear()
    revealRange.mockClear()
    showTextDocument.mockClear()
    showTextDocument.mockResolvedValue(shownEditor)
    showWarningMessage.mockClear()
    sourceText = '.box { color: #777; background: #fff; }'
    const { contrastDiagnosticStore } =
      await import('../src/contrast/diagnostics')
    const { Range } = await import('vscode')
    contrastDiagnosticStore.set(activeTextEditor.document.uri, 4, [
      {
        diagnostic: {
          range: new Range(
            activeTextEditor.document.positionAt(
              14,
            ) as unknown as Vscode.Position,
            activeTextEditor.document.positionAt(
              18,
            ) as unknown as Vscode.Position,
          ),
        } as Vscode.Diagnostic,
        pair: {
          background: {
            color: 'rgb(255, 255, 255)',
            originalText: '#fff',
            range: { start: 32, end: 36 },
          },
          contextKey: 'rule:0',
          foreground: {
            color: 'rgb(119, 119, 119)',
            originalText: '#777',
            range: { start: 14, end: 18 },
          },
          variantKey: '',
        },
      },
    ])
    const { useCommands } = await import('../src/commands')
    useCommands()

    await registeredCommands.get(
      'color-highlight.internal.checkContrastPair',
    )?.({
      range: {
        end: { character: 18, line: 0 },
        start: { character: 14, line: 0 },
      },
      uri: 'file:///tmp/example.css',
      version: 4,
    })

    expect(executeCommand).toHaveBeenCalledWith(
      'color-highlight.checkColorContrast',
      expect.objectContaining({
        background: expect.objectContaining({ color: 'rgb(255, 255, 255)' }),
        foreground: expect.objectContaining({ color: 'rgb(119, 119, 119)' }),
      }),
    )
    const validPayload = {
      range: {
        end: { character: 18, line: 0 },
        start: { character: 14, line: 0 },
      },
      uri: 'file:///tmp/example.css',
      version: 4,
    }
    await registeredCommands.get(
      'color-highlight.internal.revealContrastForeground',
    )?.(validPayload)
    await registeredCommands.get(
      'color-highlight.internal.revealContrastBackground',
    )?.(validPayload)
    expect(showTextDocument).toHaveBeenCalledTimes(2)
    expect(revealRange).toHaveBeenCalledTimes(2)

    await registeredCommands.get(
      'color-highlight.internal.checkContrastPair',
    )?.({ ...validPayload, uri: 'file:///tmp/other.css' })
    await registeredCommands.get(
      'color-highlight.internal.checkContrastPair',
    )?.({ ...validPayload, version: 5 })
    await registeredCommands.get(
      'color-highlight.internal.checkContrastPair',
    )?.({
      ...validPayload,
      range: {
        end: { character: 19, line: 0 },
        start: { character: 15, line: 0 },
      },
    })
    expect(showWarningMessage).toHaveBeenCalledTimes(3)

    sourceText = '.box { color: #000; background: #fff; }'
    await registeredCommands.get(
      'color-highlight.internal.checkContrastPair',
    )?.({
      range: {
        end: { character: 18, line: 0 },
        start: { character: 14, line: 0 },
      },
      uri: 'file:///tmp/example.css',
      version: 4,
    })
    expect(showWarningMessage).toHaveBeenCalledWith(
      'These color diagnostics are no longer current.',
    )
    expect(showWarningMessage).toHaveBeenCalledTimes(4)
  })

  it('disables validated diagnostics only at workspace scope', async () => {
    vi.resetModules()
    registeredCommands.clear()
    updateWorkspaceConfig.mockClear()
    sourceText = '.box { color: #777; background: #fff; }'
    const { contrastDiagnosticStore } =
      await import('../src/contrast/diagnostics')
    const { Range } = await import('vscode')
    contrastDiagnosticStore.set(activeTextEditor.document.uri, 4, [
      {
        diagnostic: {
          range: new Range(
            activeTextEditor.document.positionAt(
              14,
            ) as unknown as Vscode.Position,
            activeTextEditor.document.positionAt(
              18,
            ) as unknown as Vscode.Position,
          ),
        } as Vscode.Diagnostic,
        pair: {
          background: {
            color: 'rgb(255, 255, 255)',
            originalText: '#fff',
            range: { start: 32, end: 36 },
          },
          contextKey: 'rule:0',
          foreground: {
            color: 'rgb(119, 119, 119)',
            originalText: '#777',
            range: { start: 14, end: 18 },
          },
          variantKey: '',
        },
      },
    ])
    const { useCommands } = await import('../src/commands')
    useCommands()

    await registeredCommands.get(
      'color-highlight.internal.disableContrastDiagnostics',
    )?.({
      range: {
        end: { character: 18, line: 0 },
        start: { character: 14, line: 0 },
      },
      uri: 'file:///tmp/example.css',
      version: 4,
    })

    expect(updateWorkspaceConfig).toHaveBeenCalledWith(
      'enableContrastDiagnostics',
      false,
      2,
    )
  })

  it('returns configuration update promises from enable commands', async () => {
    vi.resetModules()
    registeredCommands.clear()
    const updatePromise = Promise.resolve()
    updateConfig.mockReturnValue(updatePromise)

    const { useCommands } = await import('../src/commands')

    useCommands()
    const result = registeredCommands.get('color-highlight.enable')?.()

    expect(result).toBe(updatePromise)
  })

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
      uri: 'file:///tmp/example.css',
      value: 'rgb(255, 0, 0)',
    })

    expect(replace).toHaveBeenCalledWith(expect.any(Object), 'rgb(255, 0, 0)')
  })

  it('does not replace a range from a different document', async () => {
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
      uri: 'file:///tmp/other.css',
      value: 'rgb(255, 0, 0)',
    })

    expect(replace).not.toHaveBeenCalled()
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
      uri: 'file:///tmp/example.css',
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
      uri: 'file:///tmp/example.css',
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
      uri: 'file:///tmp/example.css',
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
      uri: 'file:///tmp/example.css',
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
      uri: 'file:///tmp/example.css',
    })

    expect(replace).toHaveBeenCalledWith(
      expect.any(Object),
      'hsl(0 100% 50% / 0.9)',
    )
  })
})
