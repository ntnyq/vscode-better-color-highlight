import type { ColorMatch } from '../types'
import { rgbString } from '../utils/color'

/**
 * Regex for bare RGB triplets (not wrapped in rgb() function).
 * e.g. "255, 0, 128" or "255 0 128"
 *
 * [^\S\n] matches whitespace but not newlines
 * Named backreference `sep` enforces consistent separator
 * Terminates before ; | whitespace | < | end to avoid matching partial expressions
 */
const RGB_NO_FN_REGEX =
  /(?<red>[.\d]{1,5})[^\S\n]*(?<sep>[^\S\n]|,)[^\S\n]*(?<green>[.\d]{1,5})[^\S\n]*\k<sep>[^\S\n]*(?<blue>[.\d]{1,5})(?=;|[^\S\n]|<|$)/gu

/**
 * Detect bare RGB triplets not wrapped in rgb() function.
 * e.g. "255, 0, 128" or "255 0 128"
 *
 * @param text - The document text to scan for bare RGB triplets
 * @returns Array of color matches found in the text
 */
export function findRgbNoFunction(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(RGB_NO_FN_REGEX)) {
    const { blue, green, red } = m.groups ?? {}
    if (!red || !green || !blue) {
      continue
    }

    const r = Number(red)
    const g = Number(green)
    const b = Number(blue)

    // Validate RGB range
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      continue
    }
    // Skip likely non-color numbers (e.g. version numbers, dates)
    if (r === 0 && g === 0 && b === 0) {
      continue
    }

    const start = m.index ?? 0
    const end = start + m[0].length

    matches.push({
      start,
      end,
      color: rgbString(Math.round(r), Math.round(g), Math.round(b)),
    })
  }

  return matches
}
