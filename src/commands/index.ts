import { useCommand } from 'reactive-vscode'
import { config } from '../config'
import { INTERNAL_COMMANDS } from '../constants/commands'
import { commands } from '../meta'
import { adjustColorAlpha } from './adjust-color-alpha'
import {
  checkContrastDiagnosticPair,
  disableContrastDiagnostics,
  revealContrastDiagnosticColor,
} from './contrast-diagnostics'
import { copyColorValue } from './copy-color'
import { getDocumentHighlightState } from './highlight-state'
import { replaceColorValue } from './replace-color'
import {
  checkWorkspaceColorContrast,
  showWorkspacePalette,
} from './workspace-palette'

/**
 * Register extension commands for color highlighting.
 */
export function useCommands() {
  useCommand(commands.enable, () => config.update('enable', true))

  useCommand(commands.disable, () => config.update('enable', false))

  useCommand(commands.copyColorAsHex, value => copyColorValue('hex', value))
  useCommand(commands.copyColorAsRgb, value => copyColorValue('rgb', value))
  useCommand(commands.copyColorAsHsl, value => copyColorValue('hsl', value))
  useCommand(commands.copyColorAsOklch, value => copyColorValue('oklch', value))

  useCommand(commands.replaceColorAsHex, value =>
    replaceColorValue('hex', value),
  )
  useCommand(commands.replaceColorAsRgb, value =>
    replaceColorValue('rgb', value),
  )
  useCommand(commands.replaceColorAsHsl, value =>
    replaceColorValue('hsl', value),
  )
  useCommand(commands.replaceColorAsOklch, value =>
    replaceColorValue('oklch', value),
  )
  useCommand(commands.adjustColorAlpha, value => adjustColorAlpha(value))
  useCommand(commands.showWorkspacePalette, () => showWorkspacePalette())
  useCommand(commands.checkColorContrast, input =>
    checkWorkspaceColorContrast(input),
  )

  useCommand(INTERNAL_COMMANDS.getHighlightState, value =>
    getDocumentHighlightState(value),
  )
  useCommand(INTERNAL_COMMANDS.checkContrastPair, value =>
    checkContrastDiagnosticPair(value),
  )
  useCommand(INTERNAL_COMMANDS.revealContrastForeground, value =>
    revealContrastDiagnosticColor(value, 'foreground'),
  )
  useCommand(INTERNAL_COMMANDS.revealContrastBackground, value =>
    revealContrastDiagnosticColor(value, 'background'),
  )
  useCommand(INTERNAL_COMMANDS.disableContrastDiagnostics, value =>
    disableContrastDiagnostics(value),
  )
}
