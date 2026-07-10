import {
  activateExtension,
  assertInMemoryCssHighlighting,
  assertRequiredCommands,
} from './shared.ts'

export async function run() {
  await activateExtension()
  await assertRequiredCommands()
  await assertInMemoryCssHighlighting()
}
