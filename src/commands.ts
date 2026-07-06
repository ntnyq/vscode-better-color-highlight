import { useCommand } from 'reactive-vscode'
import { env, window, workspace } from 'vscode'
import { config } from './config'
import { getStrategies } from './core/strategy-registry'
import { getColorHover } from './hover/color-hover'
import { commands } from './meta'
import type { ColorPresentations } from './utils/color/presentation'

/**
 * Color presentation formats supported by copy commands.
 */
type CopyColorFormat = 'hex' | 'hsl' | 'oklch' | 'rgb'

/**
 * Register the enable and disable commands for color highlighting.
 */
export function useCommands() {
  useCommand(commands.enable, () => {
    config.update('enable', true)
  })

  useCommand(commands.disable, () => {
    config.update('enable', false)
  })

  useCommand(commands.copyColorAsHex, value => copyColorValue('hex', value))
  useCommand(commands.copyColorAsRgb, value => copyColorValue('rgb', value))
  useCommand(commands.copyColorAsHsl, value => copyColorValue('hsl', value))
  useCommand(commands.copyColorAsOklch, value => copyColorValue('oklch', value))
}

/**
 * Copy an explicit color value, or resolve the requested format from the active editor.
 *
 * @param format - Presentation format requested by the command.
 * @param value - Optional value supplied by a hover command link.
 */
async function copyColorValue(format: CopyColorFormat, value: unknown) {
  const resolvedValue =
    typeof value === 'string' && value.length > 0
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
  return presentations[format]
}
