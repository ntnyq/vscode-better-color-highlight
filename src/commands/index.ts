import { useCommand } from 'reactive-vscode'
import { config } from '../config'
import { commands } from '../meta'

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
}
