import { isNumber, isRecord, isString } from '@ntnyq/utils'
import { getOffsetRange } from './offset-range'
import type { AdjustColorAlphaPayload, ReplaceColorPayload } from './types'

/**
 * Validate a replacement command payload.
 *
 * @param value - Unknown command argument.
 * @returns A replacement payload, if valid.
 */
export function getReplaceColorPayload(
  value: unknown,
): ReplaceColorPayload | undefined {
  if (!isRecord(value) || !isString(value.uri) || !isString(value.value)) {
    return undefined
  }

  const range = getOffsetRange(value.range)
  if (!range || !isString(value.originalText)) {
    return undefined
  }

  return {
    originalText: value.originalText,
    range,
    uri: value.uri,
    value: value.value,
  }
}

/**
 * Validate an alpha adjustment command payload.
 *
 * @param value - Unknown command argument.
 * @returns An alpha adjustment payload, if valid.
 */
export function getAdjustColorAlphaPayload(
  value: unknown,
): AdjustColorAlphaPayload | undefined {
  if (
    !isRecord(value) ||
    !isNumber(value.delta) ||
    !isString(value.originalColor) ||
    !isString(value.originalText) ||
    !isString(value.uri)
  ) {
    return undefined
  }

  const range = getOffsetRange(value.range)
  if (!range) {
    return undefined
  }

  return {
    delta: value.delta,
    originalColor: value.originalColor,
    originalText: value.originalText,
    range,
    uri: value.uri,
  }
}
