import {
  formatColorPresentation,
  getColorPresentationsFromRgba,
  parseResolvedColor,
  withAlpha,
} from '../utils/color/presentation'
import { replaceActiveEditorRange } from './editor-range'
import { getAdjustColorAlphaPayload } from './payloads'
import { getFormatForSourceText, preserveHexCase } from './source-format'

/**
 * Adjust a color alpha channel and replace the original source range.
 *
 * @param value - Command payload supplied by a hover link.
 */
export async function adjustColorAlpha(value: unknown) {
  const payload = getAdjustColorAlphaPayload(value)
  if (!payload) {
    return
  }

  const color = parseResolvedColor(payload.originalColor)
  if (!color) {
    return
  }

  const nextColor = withAlpha(color, color.a + payload.delta)
  const presentations = getColorPresentationsFromRgba(nextColor)
  const format = getFormatForSourceText(payload.originalText)
  const replacement = formatColorPresentation(presentations, format)
  const normalizedReplacement =
    format === 'hex'
      ? preserveHexCase(replacement, payload.originalText)
      : replacement

  await replaceActiveEditorRange(payload, normalizedReplacement)
}
