import {
  activateExtension,
  assertInMemoryAnsiHighlighting,
  assertInMemoryCssHighlighting,
  assertInMemoryContrastDiagnostic,
  assertRequiredCommands,
} from './shared.ts'

export async function run() {
  await activateExtension()
  await assertRequiredCommands()
  await assertInMemoryCssHighlighting()
  await assertInMemoryAnsiHighlighting()
  await assertInMemoryContrastDiagnostic()
}
