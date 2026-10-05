import {
  activateExtension,
  assertAbsoluteColorHighlighting,
  assertInMemoryCssHighlighting,
  assertRelativeColorHighlighting,
  assertRequiredCommands,
} from '../shared.ts'

/**
 * Exercise only shipped runtime files after an isolated VSIX installation.
 */
export async function run(): Promise<void> {
  await activateExtension()
  await assertRequiredCommands()
  await assertInMemoryCssHighlighting()
  await assertRelativeColorHighlighting()
  await assertAbsoluteColorHighlighting()
}
