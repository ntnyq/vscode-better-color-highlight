import { isNumber, isRecord } from '@ntnyq/utils'
import type { OffsetRange } from './types'

/**
 * Read and validate a document offset range.
 *
 * @param value - Unknown range payload.
 * @returns Validated offset range, if available.
 */
export function getOffsetRange(value: unknown): OffsetRange | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { end, start } = value
  if (!isNumber(start) || !isNumber(end)) {
    return undefined
  }

  const range = { end, start }
  return isValidOffsetRange(range) ? range : undefined
}

/**
 * Check whether an offset range is ordered and finite.
 *
 * @param range - Offset range to validate.
 * @returns Whether the range can be used to build a VS Code range.
 */
export function isValidOffsetRange(range: OffsetRange): boolean {
  return (
    Number.isFinite(range.start) &&
    Number.isFinite(range.end) &&
    range.start >= 0 &&
    range.end >= range.start
  )
}
