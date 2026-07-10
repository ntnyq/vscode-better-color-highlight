import { NAMED_COLORS } from '../../constants'
import { rgbString } from '../../utils/color'
import { findColorFunctions } from '../color-functions'
import { findHexRGBA } from '../hex'

/** Resolve one complete CSS color value using the extension's color parsers. */
export function resolveTailwindColorValue(
  value: string,
): Promise<string | null> {
  return Promise.resolve(resolveTailwindColorValueImmediately(value))
}

/** Synchronous resolver for the static base-palette detector. */
export function resolveTailwindColorValueImmediately(
  value: string,
): string | null {
  const normalized = value.trim()
  const functional = findColorFunctions(normalized)[0]

  if (functional?.start === 0 && functional.end === normalized.length) {
    return functional.color
  }

  const hex = findHexRGBA(normalized)[0]
  if (hex?.start === 0 && hex.end === normalized.length) {
    return hex.color
  }

  const named = NAMED_COLORS.get(normalized.toLowerCase())
  return named ? rgbString(named[0], named[1], named[2]) : null
}
