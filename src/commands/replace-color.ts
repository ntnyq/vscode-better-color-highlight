import { replaceActiveEditorRange } from './editor-range'
import { getReplaceColorPayload } from './payloads'
import { preserveHexCase } from './source-format'
import type { CopyColorFormat } from './types'

/**
 * Replace a color range with a hover-provided formatted value.
 *
 * @param format - Presentation format being inserted.
 * @param value - Command payload supplied by a hover link.
 */
export async function replaceColorValue(
  format: CopyColorFormat,
  value: unknown,
) {
  const payload = getReplaceColorPayload(value)
  if (!payload) {
    return
  }

  const replacement =
    format === 'hex'
      ? preserveHexCase(payload.value, payload.originalText)
      : payload.value

  await replaceActiveEditorRange(payload, replacement)
}
