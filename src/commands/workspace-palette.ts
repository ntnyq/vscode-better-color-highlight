import { isRecord, isString } from '@ntnyq/utils'
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
  WorkspaceColorGroup,
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

interface ContrastColorPair {
  readonly background: ContrastColorSelection
  readonly foreground: ContrastColorSelection
}

type ContrastColorPairSelection =
  | { readonly kind: 'back' }
  | { readonly kind: 'cancel' }
  | ({ readonly kind: 'selected' } & ContrastColorPair)

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
  if (!isContrastCommandInput(input)) {
    return
  }

  await runWorkspaceColorContrast(input)
}

async function runWorkspaceColorContrast(
  input: ContrastCommandInput,
): Promise<void> {
  const requiresPalette = !input.background || !input.foreground
  const palette =
    input.palette ??
    (requiresPalette ? ((await scanPalette()) ?? undefined) : undefined)
  if (requiresPalette && !palette) {
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
      if (!palette) {
        return
      }
      const selection = await selectContrastColorPair(
        palette,
        background,
        foreground,
      )
      if (selection.kind === 'cancel') {
        return
      }
      if (selection.kind === 'back') {
        background = undefined
        continue
      }
      background = selection.background
      foreground = selection.foreground
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

function isContrastCommandInput(value: unknown): value is ContrastCommandInput {
  return (
    isRecord(value) &&
    (value.background === undefined ||
      isContrastColorSelection(value.background)) &&
    (value.foreground === undefined ||
      isContrastColorSelection(value.foreground)) &&
    (value.palette === undefined || isWorkspacePaletteResult(value.palette))
  )
}

function isContrastColorSelection(
  value: unknown,
): value is ContrastColorSelection {
  return (
    isRecord(value) &&
    isString(value.color) &&
    (value.occurrence === undefined ||
      isWorkspaceColorOccurrence(value.occurrence))
  )
}

function isWorkspacePaletteResult(
  value: unknown,
): value is WorkspacePaletteResult {
  return (
    isRecord(value) &&
    Array.isArray(value.groups) &&
    value.groups.every(isWorkspaceColorGroup) &&
    typeof value.occurrenceTruncated === 'boolean' &&
    isNonNegativeInteger(value.scannedFileCount) &&
    isNonNegativeInteger(value.skippedFileCount) &&
    typeof value.truncated === 'boolean'
  )
}

function isWorkspaceColorGroup(value: unknown): value is WorkspaceColorGroup {
  if (
    !isRecord(value) ||
    !isString(value.color) ||
    !Array.isArray(value.occurrences) ||
    !value.occurrences.every(isWorkspaceColorOccurrence) ||
    !isRecord(value.presentations)
  ) {
    return false
  }

  const { presentations } = value
  return (
    isString(presentations.alpha) &&
    isString(presentations.hex) &&
    isString(presentations.hsl) &&
    isString(presentations.oklch) &&
    isString(presentations.rgb)
  )
}

function isWorkspaceColorOccurrence(
  value: unknown,
): value is WorkspaceColorOccurrence {
  return (
    isRecord(value) &&
    isString(value.color) &&
    isNonNegativeInteger(value.start) &&
    isNonNegativeInteger(value.end) &&
    value.end >= value.start &&
    isString(value.sourceText) &&
    isString(value.uri)
  )
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

async function selectContrastColorPair(
  palette: WorkspacePaletteResult,
  background: ContrastColorSelection | undefined,
  foreground: ContrastColorSelection | undefined,
): Promise<ContrastColorPairSelection> {
  if (!background) {
    const selection = await selectContrastColor(
      palette,
      'Background',
      Boolean(foreground),
    )
    if (!selection || selection === 'back') {
      return { kind: 'cancel' }
    }
    background = selection
  }

  if (!foreground) {
    const selection = await selectContrastColor(palette, 'Foreground', true)
    if (!selection) {
      return { kind: 'cancel' }
    }
    if (selection === 'back') {
      return { kind: 'back' }
    }
    foreground = selection
  }

  return { background, foreground, kind: 'selected' }
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
