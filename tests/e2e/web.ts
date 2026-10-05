import { assertAndroidResourceNavigation } from './android-resource-navigation.ts'
import { assertNativeColorEditing } from './native-color-editing.ts'
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
  await assertNativeColorEditing()
  await assertAndroidResourceNavigation()
}
