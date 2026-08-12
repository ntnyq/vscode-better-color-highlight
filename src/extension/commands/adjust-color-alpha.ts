import { formatColorForSourceWithAlphaDelta } from '../../engine/presentation/source-color'
import {
  formatDartColorWithAlphaDelta,
  isDartColorSource,
} from '../../engine/strategies/dart-colors'
import {
  formatColorPresentation,
  getColorPresentationsFromRgba,
  parseResolvedColor,
  withAlpha,
} from '../../shared/color/presentation'
import { config } from '../config'
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
  if (payload.sourceKind) {
    const sourceReplacement = formatColorForSourceWithAlphaDelta(
      payload.delta,
      payload.originalText,
      payload.sourceKind,
    )
    if (sourceReplacement) {
      await replaceActiveEditorRange(payload, sourceReplacement)
    }
    return
  }
  const dartReplacement = formatDartColorWithAlphaDelta(
    payload.delta,
    payload.originalText,
  )
  if (dartReplacement) {
    await replaceActiveEditorRange(payload, dartReplacement)
    return
  }
  if (isDartColorSource(payload.originalText)) {
    return
  }

  const presentations = getColorPresentationsFromRgba(nextColor, {
    useARGB: config.useARGB,
  })
  const format = getFormatForSourceText(payload.originalText)
  const replacement = formatColorPresentation(presentations, format)
  const normalizedReplacement =
    format === 'hex'
      ? preserveHexCase(replacement, payload.originalText)
      : replacement

  await replaceActiveEditorRange(payload, normalizedReplacement)
}
