import { isString } from '@ntnyq/utils'
import { env, window, workspace } from 'vscode'
import { config } from '../config'
import { getStrategies } from '../core/strategy-registry'
import { getColorHover } from '../hover/color-hover'
import {
  formatColorPresentation,
  type ColorPresentations,
} from '../utils/color/presentation'
import type { CopyColorFormat } from './types'

/**
 * Copy an explicit color value, or resolve the requested format from the active editor.
 *
 * @param format - Presentation format requested by the command.
 * @param value - Optional value supplied by a hover command link.
 */
export async function copyColorValue(format: CopyColorFormat, value: unknown) {
  const resolvedValue =
    isString(value) && value.length > 0
      ? value
      : await getActiveEditorColorValue(format)

  if (!resolvedValue) {
    return
  }

  await env.clipboard.writeText(resolvedValue)
  await window.showInformationMessage(`Copied ${resolvedValue}`)
}

/**
 * Resolve the requested color representation from the active editor selection.
 *
 * @param format - Presentation format requested by the command.
 * @returns The formatted color value under the cursor, if available.
 */
async function getActiveEditorColorValue(
  format: CopyColorFormat,
): Promise<string | undefined> {
  const editor = window.activeTextEditor
  if (!editor) {
    return undefined
  }

  const document = editor.document
  const hover = await getColorHover({
    config,
    detectors: getStrategies(document.languageId, config),
    filePath: document.uri.toString(),
    languageId: document.languageId,
    offset: document.offsetAt(editor.selection.active),
    text: document.getText(),
    workspaceIsTrusted: workspace.isTrusted,
  })

  if (!hover) {
    return undefined
  }

  return getPresentationValue(hover.presentations, format)
}

/**
 * Select one formatted value from a color presentation set.
 *
 * @param presentations - Available color presentation strings.
 * @param format - Requested copy format.
 * @returns The formatted color value for the requested format.
 */
function getPresentationValue(
  presentations: ColorPresentations,
  format: CopyColorFormat,
): string {
  return formatColorPresentation(presentations, format)
}
