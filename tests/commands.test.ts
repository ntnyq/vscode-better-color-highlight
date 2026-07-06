import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'

type CommandHandler = (...args: unknown[]) => unknown

const registeredCommands = new Map<string, CommandHandler>()
const updateConfig = vi.fn<(key: string, value: unknown) => unknown>()
const writeText = vi.fn<(value: string) => Promise<void>>()
const showInformationMessage = vi.fn<(message: string) => unknown>()
const activeTextEditor = {
  document: {
    getText: () => '.box { color: #ff0000; }',
    languageId: 'css',
    offsetAt: () => 16,
    uri: {
      toString: () => 'file:///tmp/example.css',
    },
  },
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
})
