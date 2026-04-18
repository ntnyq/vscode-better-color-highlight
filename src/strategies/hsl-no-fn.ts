import { hslToRgb, rgbString } from '../color/convert'
import type { ColorMatch } from '../core/types'

/**
 * Regex for bare HSL triplets (not wrapped in hsl() function).
 * e.g. "210, 50%, 50%" or "210 50% 50%"
 *
 * [^\S\n] matches whitespace but not newlines
 * Named backreference `sep` enforces consistent separator
 * Hue: number optionally with deg/grad/rad/turn unit
 * Saturation and lightness must end with %
 * Terminates with ; | $ to avoid matching partial expressions
 */
const HSL_NO_FN_REGEX =
  /([\d.]+(?:deg|grad|rad|turn)?)[^\S\n]*(?<sep>[^\S\n]|,)[^\S\n]*([\d.]+)%[^\S\n]*\k<sep>[^\S\n]*([\d.]+)%(?:;| |$)/gi

/**
 * Detect bare HSL triplets not wrapped in hsl() function.
 * e.g. "210, 50%, 50%" or "210 50% 50%"
 *
 * @param text - The document text to scan for bare HSL triplets
 * @returns Array of color matches found in the text
 */
export function findHslNoFunction(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(HSL_NO_FN_REGEX)) {
    const hStr = m[1]
    const sStr = m[3]
    const lStr = m[4]

    const h = parseAngle(hStr)
    const s = Number.parseFloat(sStr) / 100
    const l = Number.parseFloat(lStr) / 100

    // Validate HSL ranges
    if (s < 0 || s > 1 || l < 0 || l > 1) continue

    const [r, g, b] = hslToRgb(h, s, l)
    if (r === 0 && g === 0 && b === 0) continue

    const start = m.index ?? 0
    const fullMatch = m[0].replace(/[; ]$/, '')
    const end = start + fullMatch.length

    matches.push({
      start,
      end,
      color: rgbString(r, g, b),
    })
  }

  return matches
}

/**
 * Parse angle value in degrees from various CSS angle units.
 *
 * @param value - The angle string (e.g. "90deg", "100grad", "1.57rad", "0.25turn")
 * @returns The angle in degrees
 */
function parseAngle(value: string): number {
  const num = Number.parseFloat(value)
  if (value.endsWith('grad')) return (num * 360) / 400
  if (value.endsWith('rad')) return (num * 180) / Math.PI
  if (value.endsWith('turn')) return num * 360
  return num
}
