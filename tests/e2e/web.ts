import { commands, extensions } from 'vscode'

const EXTENSION_ID = 'ntnyq.vscode-better-color-highlight'

export async function run() {
  const extension = extensions.getExtension(EXTENSION_ID)
  if (!extension) {
    throw new Error(`Expected ${EXTENSION_ID} to be installed`)
  }

  await extension.activate()
  if (!extension.isActive) {
    throw new Error(`Expected ${EXTENSION_ID} to activate`)
  }

  const registeredCommands = await commands.getCommands(true)
  if (!registeredCommands.includes('color-highlight.enable')) {
    throw new Error('Expected color-highlight.enable to be registered')
  }
}
