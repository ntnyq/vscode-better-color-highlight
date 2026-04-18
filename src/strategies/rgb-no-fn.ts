import { rgbString } from '../color/convert'
import type { ColorMatch } from '../core/types'

/**
 * Regex for bare RGB triplets (not wrapped in rgb() function).
 * e.g. "255, 0, 128" or "255 0 128"
 *
 * [^\S\n] matches whitespace but not newlines
 * Named backreference `sep` enforces consistent separator
 * Terminates with ; | $ to avoid matching partial expressions
 */
const RGB_NO_FN_REGEX =
  /([.\d]{1,5})[^\S\n]*(?<sep>[^\S\n]|,)[^\S\n]*([.\d]{1,5})[^\S\n]*\k<sep>[^\S\n]*([.\d]{1,5})(?:;| |$)/g

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
    const r = Number.parseFloat(m[1])
    const g = Number.parseFloat(m[3])
    const b = Number.parseFloat(m[4])

    // Validate RGB range
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) continue
    // Skip likely non-color numbers (e.g. version numbers, dates)
    if (r === 0 && g === 0 && b === 0) continue

    const start = m.index ?? 0
    // Trim trailing separator from match
    const fullMatch = m[0].replace(/[; ]$/, '')
    const end = start + fullMatch.length

    matches.push({
      start,
      end,
      color: rgbString(Math.round(r), Math.round(g), Math.round(b)),
    })
  }

  return matches
}
