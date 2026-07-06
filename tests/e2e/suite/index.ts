import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Uri, commands, extensions, window, workspace } from 'vscode'

const EXTENSION_ID = 'ntnyq.vscode-better-color-highlight'
const CONFIG_SECTION = 'color-highlight'
const CONFIG_WAIT_ATTEMPTS = 20
const CONFIG_WAIT_INTERVAL_MS = 50
const DECORATION_PIPELINE_WAIT_MS = 300

async function waitForConfigValue<T>(key: string, expected: T) {
  for (let attempt = 0; attempt < CONFIG_WAIT_ATTEMPTS; attempt++) {
    const value = workspace.getConfiguration(CONFIG_SECTION).get<T>(key)
    if (value === expected) {
      return
    }

    await delay(CONFIG_WAIT_INTERVAL_MS)
  }

  assert.equal(workspace.getConfiguration(CONFIG_SECTION).get(key), expected)
}

export async function run() {
  const extension = extensions.getExtension(EXTENSION_ID)
  assert.ok(extension, `Expected ${EXTENSION_ID} to be installed`)

  await extension.activate()
  assert.equal(extension.isActive, true)

  const registeredCommands = await commands.getCommands(true)
  assert.ok(registeredCommands.includes('color-highlight.enable'))
  assert.ok(registeredCommands.includes('color-highlight.disable'))
  assert.ok(registeredCommands.includes('color-highlight.copyColorAsHex'))
  assert.ok(registeredCommands.includes('color-highlight.copyColorAsRgb'))
  assert.ok(registeredCommands.includes('color-highlight.copyColorAsHsl'))
  assert.ok(registeredCommands.includes('color-highlight.copyColorAsOklch'))

  await commands.executeCommand('color-highlight.disable')
  await waitForConfigValue('enable', false)

  await commands.executeCommand('color-highlight.enable')
  await waitForConfigValue('enable', true)

  const document = await workspace.openTextDocument(
    Uri.file(resolve(extension.extensionPath, 'playground/simple.css')),
  )
  await window.showTextDocument(document)

  await workspace
    .getConfiguration(CONFIG_SECTION)
    .update('markerType', 'outline', true)
  await waitForConfigValue('markerType', 'outline')

  await delay(DECORATION_PIPELINE_WAIT_MS)
}
