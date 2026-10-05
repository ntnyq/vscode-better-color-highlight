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
import { assertAndroidResourceNavigation } from '../android-resource-navigation.ts'
import { assertNativeColorEditing } from '../native-color-editing.ts'
import {
  activateExtension,
  assertAbsoluteColorHighlighting,
  assertInMemoryAnsiHighlighting,
  assertInMemoryCssHighlighting,
  assertInMemoryContrastDiagnostic,
  assertRequiredCommands,
  assertRelativeColorHighlighting,
  waitForHighlightState,
} from '../shared.ts'

const EXTENSION_ID = 'ntnyq.vscode-better-color-highlight'
const CONFIG_SECTION = 'color-highlight'
const CONFIG_WAIT_ATTEMPTS = 20
const CONFIG_WAIT_INTERVAL_MS = 50

/**
 * Wait for a configuration value to match within the retry limit.
 */
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

/**
 * Run desktop smoke checks for commands, highlighting, and configuration.
 */
export async function run() {
  await activateExtension()
  await assertRequiredCommands()
  await assertInMemoryCssHighlighting()
  await assertRelativeColorHighlighting()
  await assertAbsoluteColorHighlighting()
  await assertInMemoryAnsiHighlighting()
  await assertInMemoryContrastDiagnostic()
  await assertNativeColorEditing()
  await assertAndroidResourceNavigation()

  const extension = extensions.getExtension(EXTENSION_ID)
  assert.ok(extension, `Expected ${EXTENSION_ID} to be installed`)

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
