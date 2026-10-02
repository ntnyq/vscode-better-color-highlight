import {
  activateExtension,
  assertInMemoryAnsiHighlighting,
  assertInMemoryCssHighlighting,
  assertInMemoryContrastDiagnostic,
  assertRequiredCommands,
  assertRelativeColorHighlighting,
} from './shared.ts'

/**
 * Run browser extension smoke checks for activation, highlighting, and
 * contrast.
 */
export async function run() {
  await activateExtension()
  await assertRequiredCommands()
  await assertInMemoryCssHighlighting()
  await assertRelativeColorHighlighting()
  await assertInMemoryAnsiHighlighting()
  await assertInMemoryContrastDiagnostic()
}
