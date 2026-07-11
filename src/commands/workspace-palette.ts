import { ProgressLocation, window, workspace } from 'vscode'
import { config } from '../config'
import {
  selectContrastColor,
  selectContrastRole,
  showContrastResult,
  showWorkspacePaletteQuickPick,
} from '../workspace-palette/quick-pick'
import {
  scanWorkspacePalette,
  createWorkspacePaletteScanConfig,
  WorkspacePaletteScanConfigurationError,
} from '../workspace-palette/scanner'
import type {
  WorkspaceColorOccurrence,
  WorkspacePaletteResult,
} from '../workspace-palette/types'

export interface ContrastColorSelection {
  readonly color: string
  readonly occurrence?: WorkspaceColorOccurrence
}

export interface ContrastCommandInput {
  readonly background?: ContrastColorSelection
  readonly foreground?: ContrastColorSelection
  readonly palette?: WorkspacePaletteResult
}

export async function showWorkspacePalette(): Promise<void> {
  const palette = await scanPalette()
  if (!palette) {
    return
  }
  if (palette.groups.length === 0) {
    await window.showInformationMessage('No colors found in the workspace.')
    return
  }

  await showWorkspacePaletteQuickPick(palette, async (selection, result) => {
    const role = await selectContrastRole()
    if (role === 'background') {
      await checkWorkspaceColorContrast({
        background: selection,
        palette: result,
      })
    } else if (role === 'foreground') {
      await checkWorkspaceColorContrast({
        foreground: selection,
        palette: result,
      })
    }
  })
}

export async function checkWorkspaceColorContrast(
  input: ContrastCommandInput = {},
): Promise<void> {
  let palette = input.palette
  if ((!input.background || !input.foreground) && !palette) {
    palette = (await scanPalette()) ?? undefined
  }
  if ((!input.background || !input.foreground) && !palette) {
    return
  }
  if (palette && palette.groups.length === 0) {
    await window.showInformationMessage('No colors found in the workspace.')
    return
  }

  let background = input.background
  let foreground = input.foreground
  while (true) {
    if (!background || !foreground) {
      const availablePalette = palette
      if (!availablePalette) {
        return
      }

      if (!background) {
        const selection = await selectContrastColor(
          availablePalette,
          'Background',
          Boolean(foreground),
        )
        if (!selection || selection === 'back') {
          return
        }
        background = selection
      }
      if (!foreground) {
        const selection = await selectContrastColor(
          availablePalette,
          'Foreground',
          true,
        )
        if (!selection) {
          return
        }
        if (selection === 'back') {
          background = undefined
          continue
        }
        foreground = selection
      }
    }

    const action = await showContrastResult(
      background,
      foreground,
      Boolean(palette),
    )
    if (action === 'cancel') {
      return
    }
    if (action === 'background') {
      background = undefined
    }
    if (action === 'foreground') {
      foreground = undefined
    }
    if (action === 'rerun') {
      background = undefined
      foreground = undefined
    }
  }
}

async function scanPalette(): Promise<WorkspacePaletteResult | null> {
  const scanConfig = createWorkspacePaletteScanConfig(config)
  const workspaceIsTrusted = workspace.isTrusted
  try {
    return await window.withProgress(
      {
        cancellable: true,
        location: ProgressLocation.Notification,
        title: 'Scanning workspace colors',
      },
      (progress, cancellationToken) =>
        scanWorkspacePalette({
          cancellationToken,
          config: scanConfig,
          onProgress: state => {
            progress.report({
              message: `${state.processedFileCount}/${state.totalFileCount} files${state.truncated ? ' (files truncated)' : ''}${state.occurrenceTruncated ? ' (occurrences truncated)' : ''}`,
            })
          },
          workspaceIsTrusted,
        }),
    )
  } catch (error) {
    if (error instanceof WorkspacePaletteScanConfigurationError) {
      await window.showWarningMessage(error.message)
      return null
    }
    throw error
  }
}
