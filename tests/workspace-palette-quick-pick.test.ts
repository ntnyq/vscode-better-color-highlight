import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuickInputButton } from 'vscode'
import type {
  WorkspaceColorGroup,
  WorkspacePaletteResult,
} from '../src/workspace-palette/types'

/* oxlint-disable vitest/prefer-import-in-mock -- partial VS Code boundary mocks intentionally avoid module-shape checking */

const mocks = vi.hoisted(() => {
  interface MockQuickPickItem {
    readonly action?: string
    readonly buttons: readonly QuickInputButton[]
    readonly description?: string
    readonly detail?: string
    readonly label: string
    readonly value?: string
  }

  interface MockTextDocument {
    readonly getText: (selection: unknown) => string
    readonly positionAt: (offset: number) => unknown
  }

  interface MockTextEditor {
    readonly revealRange: (selection: unknown) => void
    selection: unknown
  }

  interface MockQuickPickItemButtonEvent {
    readonly button: QuickInputButton
    readonly item: MockQuickPickItem
  }
  type MockProgressTask = (
    progress: { readonly report: (value: unknown) => void },
    cancellationToken: { readonly isCancellationRequested: boolean },
  ) => unknown

  class MockQuickPick {
    public activeItems: unknown[] = []
    public buttons: unknown[] = []
    public busy = false
    public canSelectMany = false
    public disposed = false
    public items: MockQuickPickItem[] = []
    public placeholder: string | undefined
    public selectedItems: (MockQuickPickItem | undefined)[] = []
    public title: string | undefined
    private readonly acceptListeners: (() => unknown)[] = []
    private readonly buttonListeners: ((
      event: MockQuickPickItemButtonEvent,
    ) => unknown)[] = []
    private readonly quickButtonListeners: ((
      button: QuickInputButton,
    ) => unknown)[] = []
    private readonly hideListeners: (() => unknown)[] = []

    public dispose(): void {
      this.disposed = true
    }

    public hide(): void {
      for (const listener of this.hideListeners) {
        listener()
      }
    }

    public onDidAccept(listener: () => unknown): {
      readonly dispose: () => void
    } {
      this.acceptListeners.push(listener)
      return {
        dispose: () =>
          MockQuickPick.removeListener(this.acceptListeners, listener),
      }
    }

    public onDidHide(listener: () => unknown): {
      readonly dispose: () => void
    } {
      this.hideListeners.push(listener)
      return {
        dispose: () =>
          MockQuickPick.removeListener(this.hideListeners, listener),
      }
    }

    public onDidTriggerItemButton(
      listener: (event: MockQuickPickItemButtonEvent) => unknown,
    ): { readonly dispose: () => void } {
      this.buttonListeners.push(listener)
      return {
        dispose: () =>
          MockQuickPick.removeListener(this.buttonListeners, listener),
      }
    }

    public onDidTriggerButton(
      listener: (button: QuickInputButton) => unknown,
    ): { readonly dispose: () => void } {
      this.quickButtonListeners.push(listener)
      return {
        dispose: () =>
          MockQuickPick.removeListener(this.quickButtonListeners, listener),
      }
    }

    public show = vi.fn<() => void>()

    public async accept(item: MockQuickPickItem | undefined): Promise<void> {
      this.selectedItems = [item]
      await Promise.all(this.acceptListeners.map(listener => listener()))
    }

    public async triggerButton(
      item: MockQuickPickItem,
      button: QuickInputButton,
    ): Promise<void> {
      await Promise.all(
        this.buttonListeners.map(listener => listener({ button, item })),
      )
    }

    public async triggerQuickButton(button: QuickInputButton): Promise<void> {
      await Promise.all(
        this.quickButtonListeners.map(listener => listener(button)),
      )
    }

    private static removeListener<T>(listeners: T[], listener: T): void {
      const index = listeners.indexOf(listener)
      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }
  }

  return {
    MockQuickPick,
    clipboardWrite: vi.fn<(value: string) => Promise<void>>(),
    picks: [] as MockQuickPick[],
    scanWorkspacePalette:
      vi.fn<
        (...args: readonly unknown[]) => Promise<WorkspacePaletteResult | null>
      >(),
    openTextDocument:
      vi.fn<(...args: readonly unknown[]) => Promise<MockTextDocument>>(),
    showInformationMessage:
      vi.fn<(...args: readonly unknown[]) => Promise<unknown>>(),
    showTextDocument:
      vi.fn<(...args: readonly unknown[]) => Promise<MockTextEditor>>(),
    showWarningMessage:
      vi.fn<(...args: readonly unknown[]) => Promise<unknown>>(),
    withProgress:
      vi.fn<
        (options: unknown, task: MockProgressTask) => Promise<unknown> | unknown
      >(),
  }
})

vi.mock('../src/config', () => ({
  config: {
    languages: ['*'],
    maxFileSize: 1_000_000,
    workspacePaletteExclude: '**/node_modules/**',
    workspacePaletteInclude: '**/*',
  },
}))

vi.mock('../src/workspace-palette/scanner', () => ({
  createWorkspacePaletteScanConfig: (config: unknown) => config,
  scanWorkspacePalette: mocks.scanWorkspacePalette,
  WorkspacePaletteScanConfigurationError: class extends Error {},
}))

vi.mock('vscode', () => ({
  env: { clipboard: { writeText: mocks.clipboardWrite } },
  ProgressLocation: { Notification: 15 },
  QuickInputButtons: { Back: { id: 'back' } },
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
  Uri: {
    parse: (value: string) => ({
      path: value.replace('file://', ''),
      toString: () => value,
    }),
  },
  window: {
    createQuickPick: () => {
      const pick = new mocks.MockQuickPick()
      mocks.picks.push(pick)
      return pick
    },
    showInformationMessage: mocks.showInformationMessage,
    showTextDocument: mocks.showTextDocument,
    showWarningMessage: mocks.showWarningMessage,
    withProgress: mocks.withProgress,
  },
  workspace: { isTrusted: true, openTextDocument: mocks.openTextDocument },
}))

const red = {
  color: 'rgb(255, 0, 0)',
  occurrences: [
    {
      color: 'rgb(255, 0, 0)',
      end: 7,
      sourceText: '#ff0000',
      start: 0,
      uri: 'file:///workspace/a.css',
    },
    {
      color: 'rgb(255, 0, 0)',
      end: 14,
      sourceText: 'rgb(255,0,0)',
      start: 2,
      uri: 'file:///workspace/b.css',
    },
  ],
  presentations: {
    alpha: '100%',
    hex: '#ff0000',
    hsl: 'hsl(0 100% 50%)',
    oklch: 'oklch(62.8% 0.2577 29.23)',
    rgb: 'rgb(255, 0, 0)',
  },
} satisfies WorkspaceColorGroup

function colorGroup(
  color: string,
  hex: string,
  sourceText = hex,
): WorkspaceColorGroup {
  return {
    color,
    occurrences: [
      {
        color,
        end: sourceText.length,
        sourceText,
        start: 0,
        uri: `file:///workspace/${hex.slice(1)}.css`,
      },
    ],
    presentations: {
      alpha: color.startsWith('rgba') ? '50%' : '100%',
      hex,
      hsl: `hsl(${hex})`,
      oklch: `oklch(${hex})`,
      rgb: color,
    },
  }
}

const black = colorGroup('rgb(0, 0, 0)', '#000000')
const white = colorGroup('rgb(255, 255, 255)', '#ffffff')
const translucentWhite = colorGroup('rgba(255, 255, 255, 0.5)', '#ffffff80')
const translucentBlack = colorGroup('rgba(0, 0, 0, 0.5)', '#00000080')

describe('workspace palette Quick Pick', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.picks.length = 0
    mocks.withProgress.mockImplementation((_options, task) =>
      task(
        { report: vi.fn<(value: unknown) => void>() },
        { isCancellationRequested: false },
      ),
    )
    mocks.scanWorkspacePalette.mockResolvedValue({
      groups: [red],
      occurrenceTruncated: true,
      scannedFileCount: 2,
      skippedFileCount: 1,
      truncated: true,
    })
  })

  it('shows scan status and disposes a cancelled palette picker', async () => {
    const { showWorkspacePalette } =
      await import('../src/commands/workspace-palette')

    const session = showWorkspacePalette()
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))

    expect(mocks.withProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        cancellable: true,
        location: 15,
      }),
      expect.any(Function),
    )
    expect(mocks.picks[0].items).toStrictEqual([
      expect.objectContaining({
        description: '2 occurrences in 2 files',
        detail: 'rgb(255, 0, 0) · hsl(0 100% 50%) · oklch(62.8% 0.2577 29.23)',
        label: '#ff0000',
      }),
    ])
    expect(mocks.picks[0].title).toBe(
      'Workspace Palette — 2 files · 1 skipped · files truncated · occurrences truncated',
    )

    mocks.picks[0].hide()
    await session

    expect(mocks.picks[0].disposed).toBe(true)
  })

  it('does not show a stale picker for empty or cancelled scans', async () => {
    const { showWorkspacePalette } =
      await import('../src/commands/workspace-palette')
    mocks.scanWorkspacePalette.mockResolvedValueOnce({
      groups: [],
      occurrenceTruncated: false,
      scannedFileCount: 1,
      skippedFileCount: 0,
      truncated: false,
    })

    await showWorkspacePalette()
    expect(mocks.showInformationMessage).toHaveBeenCalledWith(
      'No colors found in the workspace.',
    )
    expect(mocks.picks).toHaveLength(0)

    mocks.scanWorkspacePalette.mockResolvedValueOnce(null)
    await showWorkspacePalette()
    expect(mocks.picks).toHaveLength(0)
  })

  it('ignores malformed contrast command input', async () => {
    const { checkWorkspaceColorContrast } =
      await import('../src/commands/workspace-palette')

    await expect(
      checkWorkspaceColorContrast({ palette: {} } as never),
    ).resolves.toBeUndefined()

    expect(mocks.scanWorkspacePalette).not.toHaveBeenCalled()
    expect(mocks.picks).toHaveLength(0)
  })

  it('copies HEX from the group button without closing the palette', async () => {
    const { showWorkspacePalette } =
      await import('../src/commands/workspace-palette')
    const session = showWorkspacePalette()
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))
    const pick = mocks.picks[0]
    const item = pick.items[0]

    await pick.triggerButton(item, item.buttons[0])

    expect(mocks.clipboardWrite).toHaveBeenCalledWith('#ff0000')
    expect(pick.disposed).toBe(false)
    pick.hide()
    await session
  })

  it('starts contrast from a group button and asks for its role', async () => {
    const { showWorkspacePalette } =
      await import('../src/commands/workspace-palette')
    const session = showWorkspacePalette()
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))
    const groupPick = mocks.picks[0]
    const groupItem = groupPick.items[0]
    await groupPick.triggerButton(groupItem, groupItem.buttons[1])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(2))
    expect(mocks.picks[1].title).toBe('Use Selected Color As')
    await mocks.picks[1].accept(mocks.picks[1].items[0])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(3))
    expect(mocks.picks[2].title).toBe('Foreground Color')
    await mocks.picks[2].accept(mocks.picks[2].items[0])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(4))

    expect(mocks.scanWorkspacePalette).toHaveBeenCalledTimes(1)
    mocks.picks[3].hide()
    await session
  })

  it('offers four copy formats and returns from occurrences to the palette', async () => {
    const { QuickInputButtons } = await import('vscode')
    const { showWorkspacePalette } =
      await import('../src/commands/workspace-palette')
    const session = showWorkspacePalette()
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))
    await mocks.picks[0].accept(mocks.picks[0].items[0])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(2))

    const expected = [
      '#ff0000',
      'rgb(255, 0, 0)',
      'hsl(0 100% 50%)',
      'oklch(62.8% 0.2577 29.23)',
    ]
    for (let index = 0; index < expected.length; index++) {
      const pick = mocks.picks.at(-1)!
      await pick.accept(pick.items[index])
      await vi.waitFor(() => expect(mocks.picks).toHaveLength(3 + index))
    }
    expect(mocks.clipboardWrite.mock.calls.map(call => call[0])).toStrictEqual(
      expected,
    )

    const occurrencePick = mocks.picks.at(-1)!
    await occurrencePick.triggerQuickButton(QuickInputButtons.Back)
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(7))
    expect(mocks.picks.at(-1)!.title).toContain('Workspace Palette')
    mocks.picks.at(-1)!.hide()
    await session
    expect(mocks.picks.every(pick => pick.disposed)).toBe(true)
  })

  it('warns for a deleted occurrence and keeps its list open', async () => {
    mocks.openTextDocument.mockRejectedValueOnce(new Error('deleted'))
    const { showWorkspacePalette } =
      await import('../src/commands/workspace-palette')
    const session = showWorkspacePalette()
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))
    await mocks.picks[0].accept(mocks.picks[0].items[0])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(2))
    await mocks.picks[1].accept(mocks.picks[1].items[4])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(3))

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      'The selected color file is no longer available.',
    )
    expect(mocks.picks[2].title).toBe('#ff0000 Occurrences')
    mocks.picks[2].hide()
    await session
  })

  it('selects and reveals only an unchanged occurrence', async () => {
    const editor = {
      revealRange: vi.fn<(selection: unknown) => void>(),
      selection: undefined,
    }
    mocks.openTextDocument.mockResolvedValueOnce({
      getText: () => '#ff0000',
      positionAt: (offset: number) => ({ offset }),
    })
    mocks.showTextDocument.mockResolvedValueOnce(editor)
    const { showWorkspacePalette } =
      await import('../src/commands/workspace-palette')
    const session = showWorkspacePalette()
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))
    await mocks.picks[0].accept(mocks.picks[0].items[0])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(2))
    await mocks.picks[1].accept(mocks.picks[1].items[4])
    await session

    expect(editor.selection).toStrictEqual(
      expect.objectContaining({ start: { offset: 0 }, end: { offset: 7 } }),
    )
    expect(editor.revealRange).toHaveBeenCalledWith(editor.selection)
  })

  it('warns and returns to occurrences when source text is stale', async () => {
    mocks.openTextDocument.mockResolvedValueOnce({
      getText: () => '#00ff00',
      positionAt: (offset: number) => ({ offset }),
    })
    const { showWorkspacePalette } =
      await import('../src/commands/workspace-palette')
    const session = showWorkspacePalette()
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))
    await mocks.picks[0].accept(mocks.picks[0].items[0])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(2))
    await mocks.picks[1].accept(mocks.picks[1].items[4])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(3))

    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      'The selected color occurrence has changed.',
    )
    expect(mocks.showTextDocument).not.toHaveBeenCalled()
    mocks.picks[2].hide()
    await session
  })

  it('shows 21:1 and every WCAG level without scanning supplied colors', async () => {
    const { checkWorkspaceColorContrast } =
      await import('../src/commands/workspace-palette')
    const session = checkWorkspaceColorContrast({
      background: { color: black.color },
      foreground: { color: white.color },
    })
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))

    expect(mocks.scanWorkspacePalette).not.toHaveBeenCalled()
    expect(mocks.picks[0].title).toBe('Color Contrast — 21.00:1')
    expect(mocks.picks[0].items.slice(0, 4)).toStrictEqual([
      expect.objectContaining({ label: 'AA normal text', description: 'Pass' }),
      expect.objectContaining({ label: 'AA large text', description: 'Pass' }),
      expect.objectContaining({
        label: 'AAA normal text',
        description: 'Pass',
      }),
      expect.objectContaining({ label: 'AAA large text', description: 'Pass' }),
    ])
    expect(mocks.picks[0].items).not.toContainEqual(
      expect.objectContaining({ action: 'background' }),
    )
    expect(mocks.picks[0].items).not.toContainEqual(
      expect.objectContaining({ action: 'foreground' }),
    )
    mocks.picks[0].hide()
    await session
  })

  it('shows effective translucent foreground and translucent-background reason', async () => {
    const { checkWorkspaceColorContrast } =
      await import('../src/commands/workspace-palette')
    let session = checkWorkspaceColorContrast({
      background: { color: black.color },
      foreground: { color: translucentWhite.color },
    })
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))
    expect(mocks.picks[0].items).toContainEqual(
      expect.objectContaining({
        label: 'Effective foreground',
        description: 'rgb(127.5, 127.5, 127.5)',
      }),
    )
    mocks.picks[0].hide()
    await session

    session = checkWorkspaceColorContrast({
      background: { color: translucentBlack.color },
      foreground: { color: white.color },
    })
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(2))
    expect(mocks.picks[1].title).toBe('Color Contrast — Indeterminate')
    expect(mocks.picks[1].items[0].detail).toContain('canvas color is unknown')
    mocks.picks[1].hide()
    await session
  })

  it('keeps both change actions when a supplied palette can be reused', async () => {
    const palette = {
      groups: [black, white],
      occurrenceTruncated: false,
      scannedFileCount: 2,
      skippedFileCount: 0,
      truncated: false,
    }
    const input = {
      background: { color: black.color },
      foreground: { color: white.color },
      palette,
    }
    const { checkWorkspaceColorContrast } =
      await import('../src/commands/workspace-palette')

    let session = checkWorkspaceColorContrast(input)
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))
    const changeBackground = mocks.picks[0].items.find(
      item => item.action === 'background',
    )
    const changeForeground = mocks.picks[0].items.find(
      item => item.action === 'foreground',
    )
    expect(changeBackground).toBeDefined()
    expect(changeForeground).toBeDefined()
    await mocks.picks[0].accept(changeBackground)
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(2))
    expect(mocks.picks[1].title).toBe('Background Color')
    mocks.picks[1].hide()
    await session

    session = checkWorkspaceColorContrast(input)
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(3))
    await mocks.picks[2].accept(
      mocks.picks[2].items.find(item => item.action === 'foreground'),
    )
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(4))
    expect(mocks.picks[3].title).toBe('Foreground Color')
    mocks.picks[3].hide()
    await session

    expect(mocks.scanWorkspacePalette).not.toHaveBeenCalled()
  })

  it('selects background then foreground and reuses one scanned palette', async () => {
    mocks.scanWorkspacePalette.mockResolvedValueOnce({
      groups: [black, white],
      occurrenceTruncated: false,
      scannedFileCount: 2,
      skippedFileCount: 0,
      truncated: false,
    })
    const { checkWorkspaceColorContrast } =
      await import('../src/commands/workspace-palette')
    const session = checkWorkspaceColorContrast()
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(1))
    expect(mocks.picks[0].title).toBe('Background Color')
    await mocks.picks[0].accept(mocks.picks[0].items[0])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(2))
    expect(mocks.picks[1].title).toBe('Foreground Color')
    await mocks.picks[1].accept(mocks.picks[1].items[1])
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(3))
    const rerun = mocks.picks[2].items.find(item => item.action === 'rerun')
    await mocks.picks[2].accept(rerun)
    await vi.waitFor(() => expect(mocks.picks).toHaveLength(4))

    expect(mocks.scanWorkspacePalette).toHaveBeenCalledTimes(1)
    expect(mocks.picks[3].title).toBe('Background Color')
    mocks.picks[3].hide()
    await session
  })
})
