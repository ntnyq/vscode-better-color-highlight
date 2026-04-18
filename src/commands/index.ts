import { useCommand } from 'reactive-vscode'
import { config } from '../config'
import { commands } from '../meta'

/**
 * Register the enable and disable commands for color highlighting.
 */
export function useCommands(): void {
  useCommand(commands.colorHighlightEnable, () => {
    config.update('color-highlight.enable', true)
  })

  useCommand(commands.colorHighlightDisable, () => {
    config.update('color-highlight.enable', false)
  })
}
