import {
  ConfigurationTarget,
  commands,
  extensions,
  languages,
  window,
  workspace,
} from 'vscode'
import type { Uri } from 'vscode'

const EXTENSION_ID = 'ntnyq.vscode-better-color-highlight'
const GET_HIGHLIGHT_STATE_COMMAND = 'color-highlight.internal.getHighlightState'
const HIGHLIGHT_STATE_WAIT_ATTEMPTS = 40
const HIGHLIGHT_STATE_WAIT_INTERVAL_MS = 100
const DIAGNOSTIC_WAIT_ATTEMPTS = 50
const DIAGNOSTIC_WAIT_INTERVAL_MS = 100
const CONFIG_SECTION = 'color-highlight'
const REQUIRED_COMMANDS = [
  'color-highlight.enable',
  'color-highlight.disable',
  'color-highlight.copyColorAsHex',
  'color-highlight.copyColorAsRgb',
  'color-highlight.copyColorAsHsl',
  'color-highlight.copyColorAsOklch',
  'color-highlight.replaceColorAsHex',
  'color-highlight.replaceColorAsRgb',
  'color-highlight.replaceColorAsHsl',
  'color-highlight.replaceColorAsOklch',
  'color-highlight.adjustColorAlpha',
  'color-highlight.showWorkspacePalette',
  'color-highlight.checkColorContrast',
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
 * Verify relative expressions, nested math, variable expansion, and overlap
 * arbitration in the real desktop/Web decoration pipeline.
 */
export async function assertRelativeColorHighlighting(): Promise<void> {
  const document = await workspace.openTextDocument({
    content:
      ':root { --brand: #ff0000; --cap: 128; --opacity: .5; } .sample { color: rgb(from var(--brand) min(calc(r / 2), var(--cap)) max(g, 0) b); background: alpha(from blue / clamp(0, var(--opacity), 1)); border-color: hwb(from red calc(h + max(60, 120)) w b); }',
    language: 'css',
  })
  await window.showTextDocument(document)
  const state = await waitForHighlightState(document.uri.toString(), 4)
  assertEqual(
    JSON.stringify([...state.colors].sort()),
    JSON.stringify(
      [
        'rgb(255, 0, 0)',
        'rgb(128, 0, 0)',
        'rgba(0, 0, 255, 0.5)',
        'rgb(0, 255, 0)',
      ].sort(),
    ),
    'Expected complete relative-color expressions',
  )
}

/**
 * Verify absolute math, legacy commas, variable substitution, and nested
 * color operands through the real desktop, Web, and packaged runtime.
 */
export async function assertAbsoluteColorHighlighting(): Promise<void> {
  const document = await workspace.openTextDocument({
    content: `
:root {
  --red: 255;
  --opacity: .5;
  --green: rgb(calc(0) max(0, 255) min(0, 1));
}
.sample {
  color: rgb(min(var(--red), 200) calc(0) 0 / clamp(0, var(--opacity), 1));
  background: rgba(calc(100%), min(0%, 10%), max(0%, -10%), 1);
  border-color: hsl(calc(.25turn) clamp(0%, 100%, 100%) min(50%, 80%));
  outline-color: color(srgb calc(0) min(0, 1) clamp(0, 1, 1));
  box-shadow: 0 0 1px color-mix(in srgb, var(--green) 50%, rgb(calc(255) 0 0));
  accent-color: alpha(from rgb(calc(255) 0 0) / calc(.5 + .25));
  invalid-unit: rgb(calc(1px) 0 0);
  invalid-division: rgb(calc(1 / 0) 0 0);
  invalid-lab-conversion: lab(50% calc(1e308) 0);
  invalid-oklab-conversion: oklab(50% calc(1e308) 0);
  caret-color: #123456;
}
`,
    language: 'css',
  })
  await window.showTextDocument(document)
  const state = await waitForHighlightState(document.uri.toString(), 8)
  assertEqual(state.colorCount, 8, 'Expected eight absolute math colors')
  assertEqual(
    JSON.stringify([...state.colors].sort()),
    JSON.stringify(
      [
        'rgb(0, 255, 0)',
        'rgba(200, 0, 0, 0.5)',
        'rgb(255, 0, 0)',
        'rgb(128, 255, 0)',
        'rgb(0, 0, 255)',
        'rgb(128, 128, 0)',
        'rgba(255, 0, 0, 0.75)',
        'rgb(18, 52, 86)',
      ].sort(),
    ),
    'Expected complete absolute-color expressions and no invalid math',
  )
}

/**
 * Enable ANSI matching temporarily and verify object-config palette handling.
 */
export async function assertInMemoryAnsiHighlighting(): Promise<void> {
  const config = workspace.getConfiguration(CONFIG_SECTION)
  const previousEnabledGlobal = config.inspect<boolean>(
    'matchAnsiEscapeCodes',
  )?.globalValue
  const previousEnabled = config.get<boolean>('matchAnsiEscapeCodes', false)
  const previousPaletteGlobal =
    config.inspect<Record<string, string>>('ansiPalette')?.globalValue
  const previousPalette = config.get<Record<string, string>>('ansiPalette', {})

  try {
    const ansiPalette = { red: '#123456' }
    await config.update('ansiPalette', ansiPalette, ConfigurationTarget.Global)
    await config.update(
      'matchAnsiEscapeCodes',
      true,
      ConfigurationTarget.Global,
    )
    await waitForConfigValue('ansiPalette', ansiPalette)
    await waitForConfigValue('matchAnsiEscapeCodes', true)

    const document = await workspace.openTextDocument({
      content: String.raw`const value = '\x1b[31m'`,
      language: 'typescript',
    })
    await window.showTextDocument(document)

    const state = await waitForHighlightState(document.uri.toString(), 1)
    assertEqual(state.colorCount, 1, 'Expected one ANSI color')
    assertEqual(
      state.colors[0],
      'rgb(18, 52, 86)',
      'Expected ANSI palette override',
    )
  } finally {
    await config.update(
      'ansiPalette',
      previousPaletteGlobal,
      ConfigurationTarget.Global,
    )
    await config.update(
      'matchAnsiEscapeCodes',
      previousEnabledGlobal,
      ConfigurationTarget.Global,
    )
    await waitForConfigValue('ansiPalette', previousPalette)
    await waitForConfigValue('matchAnsiEscapeCodes', previousEnabled)
  }
}

/**
 * Enable diagnostics temporarily and verify one deterministic CSS pair.
 */
export async function assertInMemoryContrastDiagnostic(): Promise<void> {
  const config = workspace.getConfiguration(CONFIG_SECTION)
  const previousGlobalValue = config.inspect<boolean>(
    'enableContrastDiagnostics',
  )?.globalValue
  const previousEffectiveValue = config.get<boolean>(
    'enableContrastDiagnostics',
    false,
  )

  try {
    await config.update(
      'enableContrastDiagnostics',
      true,
      ConfigurationTarget.Global,
    )
    await waitForConfigValue('enableContrastDiagnostics', true)

    const document = await workspace.openTextDocument({
      content: '.sample { color: #777; background-color: #777; }',
      language: 'css',
    })
    await window.showTextDocument(document)

    const diagnostics = await waitForDiagnostics(document.uri, 1)
    const [diagnostic] = diagnostics
    assertEqual(
      diagnostic?.source,
      'Better Color Highlight',
      'Expected extension-owned contrast diagnostic',
    )
    assertEqual(
      diagnostic?.code,
      'low-color-contrast',
      'Expected low-contrast diagnostic code',
    )
    assertEqual(
      diagnostic?.message,
      'Color contrast 1.00:1 is below WCAG AA 4.5:1 for normal text.',
      'Expected deterministic low-contrast diagnostic',
    )
  } finally {
    await workspace
      .getConfiguration(CONFIG_SECTION)
      .update(
        'enableContrastDiagnostics',
        previousGlobalValue,
        ConfigurationTarget.Global,
      )
    await waitForConfigValue(
      'enableContrastDiagnostics',
      previousEffectiveValue,
    )
  }
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
 * Wait for a configuration value to match structurally within the retry limit.
 */
export async function waitForConfigValue<T>(
  key: string,
  expected: T,
): Promise<void> {
  for (let attempt = 0; attempt < DIAGNOSTIC_WAIT_ATTEMPTS; attempt++) {
    const value = workspace.getConfiguration(CONFIG_SECTION).get<T>(key)
    if (JSON.stringify(value) === JSON.stringify(expected)) {
      return
    }

    await wait(DIAGNOSTIC_WAIT_INTERVAL_MS)
  }

  assertEqual(
    JSON.stringify(workspace.getConfiguration(CONFIG_SECTION).get<T>(key)),
    JSON.stringify(expected),
    `Expected ${key} configuration to update`,
  )
}

/**
 * Wait for a document's diagnostic count or fail with the latest diagnostics.
 */
async function waitForDiagnostics(uri: Uri, expectedCount: number) {
  let latest = languages.getDiagnostics(uri)

  for (let attempt = 0; attempt < DIAGNOSTIC_WAIT_ATTEMPTS; attempt++) {
    latest = languages.getDiagnostics(uri)
    if (latest.length === expectedCount) {
      return latest
    }

    await wait(DIAGNOSTIC_WAIT_INTERVAL_MS)
  }

  throw new Error(
    `Expected ${expectedCount} diagnostics for ${uri.toString()}; received ${JSON.stringify(latest)}`,
  )
}

/**
 * Assert a condition without depending on Node built-in modules.
 *
 * @param value - Value that must be truthy
 * @param message - Failure message
 */
export function assertCondition(
  value: unknown,
  message: string,
): asserts value {
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
export function assertEqual<T>(actual: T, expected: T, message: string): void {
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
