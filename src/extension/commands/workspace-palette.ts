import { isRecord, isString } from '@ntnyq/utils'
import { ProgressLocation, window, workspace } from 'vscode'
import {
  selectContrastColor,
  selectContrastRole,
  showContrastResult,
  showWorkspacePaletteQuickPick,
} from '../../features/workspace-palette/quick-pick'
import {
  scanWorkspacePalette,
  createWorkspacePaletteScanConfig,
  WorkspacePaletteScanConfigurationError,
} from '../../features/workspace-palette/scanner'
import type {
  ContrastColorSelection,
  ContrastCommandInput,
  WorkspaceColorGroup,
  WorkspaceColorOccurrence,
  WorkspacePaletteResult,
} from '../../features/workspace-palette/types'
import { config } from '../config'

interface ContrastColorPair {
  readonly background: ContrastColorSelection
  readonly foreground: ContrastColorSelection
}

type ContrastColorPairSelection =
  | { readonly kind: 'back' }
  | { readonly kind: 'cancel' }
  | ({ readonly kind: 'selected' } & ContrastColorPair)

/**
 * Scan and display workspace colors with optional contrast selection actions.
 */
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

/**
 * Validate contrast command input before starting the selection workflow.
 */
export async function checkWorkspaceColorContrast(
  input: ContrastCommandInput = {},
): Promise<void> {
  if (!isContrastCommandInput(input)) {
    return
  }

  await runWorkspaceColorContrast(input)
}

/**
 * Collect missing color selections and display repeatable contrast results.
 */
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

/**
 * Validate optional colors and palette data supplied to the contrast command.
 */
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

/**
 * Validate a serialized color selection and its optional source occurrence.
 */
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

/**
 * Validate palette groups, scan counts, and truncation flags.
 */
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

/**
 * Validate a palette group's color, occurrences, and presentation strings.
 */
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

/**
 * Validate a serialized color occurrence and its ordered source offsets.
 */
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

/**
 * Check whether an unknown value is a nonnegative integer.
 */
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * Prompt for missing background and foreground colors with back navigation.
 */
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

/**
 * Scan workspace colors with cancellable progress and configuration warnings.
 */
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
