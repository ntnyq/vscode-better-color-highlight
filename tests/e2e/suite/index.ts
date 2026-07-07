import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  ConfigurationTarget,
  Uri,
  commands,
  extensions,
  window,
  workspace,
} from 'vscode'

const EXTENSION_ID = 'ntnyq.vscode-better-color-highlight'
const CONFIG_SECTION = 'color-highlight'
const GET_HIGHLIGHT_STATE_COMMAND = 'color-highlight.internal.getHighlightState'
const CONFIG_WAIT_ATTEMPTS = 20
const CONFIG_WAIT_INTERVAL_MS = 50
const HIGHLIGHT_STATE_WAIT_ATTEMPTS = 40
const HIGHLIGHT_STATE_WAIT_INTERVAL_MS = 100

interface HighlightState {
  readonly colorCount: number
  readonly colors: string[]
  readonly languageId: string
  readonly matchCount: number
  readonly uri: string
}

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

async function waitForHighlightState(
  uri: string,
  expectedMatchCount: number,
): Promise<HighlightState> {
  for (let attempt = 0; attempt < HIGHLIGHT_STATE_WAIT_ATTEMPTS; attempt++) {
    const state = await commands.executeCommand<HighlightState | undefined>(
      GET_HIGHLIGHT_STATE_COMMAND,
      uri,
    )
    if (state?.matchCount === expectedMatchCount) {
      return state
    }

    await delay(HIGHLIGHT_STATE_WAIT_INTERVAL_MS)
  }

  const state = await commands.executeCommand<HighlightState | undefined>(
    GET_HIGHLIGHT_STATE_COMMAND,
    uri,
  )
  assert.equal(state?.matchCount, expectedMatchCount)

  return state
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

  const state = await waitForHighlightState(document.uri.toString(), 30)
  assert.equal(state.colorCount, 16)
  assert.equal(state.languageId, 'css')

  const config = workspace.getConfiguration(CONFIG_SECTION)
  const previousWorkspaceMarkerType =
    config.inspect<string>('markerType')?.workspaceValue

  try {
    await config.update('markerType', 'outline', ConfigurationTarget.Workspace)
    await waitForConfigValue('markerType', 'outline')
  } finally {
    await workspace
      .getConfiguration(CONFIG_SECTION)
      .update(
        'markerType',
        previousWorkspaceMarkerType,
        ConfigurationTarget.Workspace,
      )
  }
}
