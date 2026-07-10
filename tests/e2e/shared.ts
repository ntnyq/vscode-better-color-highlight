import { commands, extensions, window, workspace } from 'vscode'

const EXTENSION_ID = 'ntnyq.vscode-better-color-highlight'
const GET_HIGHLIGHT_STATE_COMMAND = 'color-highlight.internal.getHighlightState'
const HIGHLIGHT_STATE_WAIT_ATTEMPTS = 40
const HIGHLIGHT_STATE_WAIT_INTERVAL_MS = 100
const REQUIRED_COMMANDS = [
  'color-highlight.enable',
  'color-highlight.disable',
  'color-highlight.copyColorAsHex',
  'color-highlight.copyColorAsRgb',
  'color-highlight.copyColorAsHsl',
  'color-highlight.copyColorAsOklch',
] as const

interface HighlightState {
  readonly colorCount: number
  readonly colors: readonly string[]
  readonly languageId: string
  readonly matchCount: number
  readonly uri: string
}

/**
 * Activate the development extension and assert its runtime state.
 */
export async function activateExtension(): Promise<void> {
  const extension = extensions.getExtension(EXTENSION_ID)
  assertCondition(extension, `Expected ${EXTENSION_ID} to be installed`)

  await extension.activate()
  assertEqual(extension.isActive, true, `Expected ${EXTENSION_ID} to activate`)
}

/**
 * Assert that the extension's public commands are registered.
 */
export async function assertRequiredCommands(): Promise<void> {
  const registeredCommands = await commands.getCommands(true)

  for (const command of REQUIRED_COMMANDS) {
    assertCondition(
      registeredCommands.includes(command),
      `Expected ${command} to be registered`,
    )
  }
}

/**
 * Open a virtual CSS document and assert that real highlighting completes.
 */
export async function assertInMemoryCssHighlighting(): Promise<void> {
  const document = await workspace.openTextDocument({
    content:
      '.sample { color: #ff0000; background: rgb(0 255 0); border-color: blue; }',
    language: 'css',
  })
  await window.showTextDocument(document)

  const state = await waitForHighlightState(document.uri.toString(), 3)
  assertEqual(state.languageId, 'css', 'Expected CSS highlight state')
  assertEqual(state.colorCount, 3, 'Expected three unique colors')
  assertEqual(
    JSON.stringify([...state.colors].sort()),
    JSON.stringify(
      ['rgb(255, 0, 0)', 'rgb(0, 255, 0)', 'rgb(0, 0, 255)'].sort(),
    ),
    'Expected resolved red, green, and blue colors',
  )
}

/**
 * Wait for the asynchronous decoration pipeline to publish highlight state.
 *
 * @param uri - Document URI to query
 * @param expectedMatchCount - Match count that marks completion
 * @returns Latest matching highlight state
 */
export async function waitForHighlightState(
  uri: string,
  expectedMatchCount: number,
): Promise<HighlightState> {
  let lastState: HighlightState | undefined

  for (let attempt = 0; attempt < HIGHLIGHT_STATE_WAIT_ATTEMPTS; attempt++) {
    lastState = await commands.executeCommand<HighlightState | undefined>(
      GET_HIGHLIGHT_STATE_COMMAND,
      uri,
    )
    if (lastState?.matchCount === expectedMatchCount) {
      return lastState
    }

    await wait(HIGHLIGHT_STATE_WAIT_INTERVAL_MS)
  }

  throw new Error(
    `Expected ${expectedMatchCount} color matches for ${uri}; last state: ${JSON.stringify(lastState)}`,
  )
}

/**
 * Assert a condition without depending on Node built-in modules.
 *
 * @param value - Value that must be truthy
 * @param message - Failure message
 */
function assertCondition(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message)
  }
}

/**
 * Assert strict equality without depending on Node built-in modules.
 *
 * @param actual - Observed value
 * @param expected - Required value
 * @param message - Failure message
 */
function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}; expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    )
  }
}

/**
 * Wait using the timer API available in desktop and Web extension hosts.
 *
 * @param milliseconds - Delay duration
 */
async function wait(milliseconds: number): Promise<void> {
  /* oxlint-disable-next-line promise/avoid-new -- browser-compatible timer bridge */
  await new Promise<void>(resolve => {
    setTimeout(resolve, milliseconds)
  })
}
