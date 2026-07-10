import { useCommand } from 'reactive-vscode'
import { config } from '../config'
import { INTERNAL_COMMANDS } from '../constants/commands'
import { commands } from '../meta'
import { adjustColorAlpha } from './adjust-color-alpha'
import { copyColorValue } from './copy-color'
import { getDocumentHighlightState } from './highlight-state'
import { replaceColorValue } from './replace-color'

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

  useCommand(INTERNAL_COMMANDS.getHighlightState, value =>
    getDocumentHighlightState(value),
  )
}
