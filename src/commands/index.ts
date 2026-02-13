import { useCommand } from 'reactive-vscode'
import { config } from '../config'
import { commands } from '../meta'

export function useCommands(): void {
  useCommand(commands.colorHighlightEnable, () => {
    config.update('color-highlight.enable', true)
  })

  useCommand(commands.colorHighlightDisable, () => {
    config.update('color-highlight.enable', false)
  })
}
