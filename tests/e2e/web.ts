import {
  activateExtension,
  assertInMemoryAnsiHighlighting,
  assertInMemoryCssHighlighting,
  assertInMemoryContrastDiagnostic,
  assertRequiredCommands,
} from './shared.ts'

/**
 * Run browser extension smoke checks for activation, highlighting, and
 * contrast.
 */
export async function run() {
  await activateExtension()
  await assertRequiredCommands()
  await assertInMemoryCssHighlighting()
  await assertInMemoryAnsiHighlighting()
  await assertInMemoryContrastDiagnostic()
}
