import { hexToRgb, hexARGBToRgb, rgbString } from '../color/convert'
import type { ColorMatch } from '../core/types'

/**
 * Regex for hex colors: #RGB, #RRGGBB, #RGBA, #RRGGBBAA, and 0x prefix.
 * The leading `.?` captures one preceding char to filter false positives.
 * Named backreference is not needed here; we check the preceding char manually.
 */
const HEX_REGEX =
  /.?((?:#|0x)([a-f0-9]{6}([a-f0-9]{2})?|[a-f0-9]{3}([a-f0-9])?))\b/gi

/**
 * Detect hex colors in RGBA mode (default).
 * #RGB, #RRGGBB, #RGBA, #RRGGBBAA
 */
export function findHexRGBA(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(HEX_REGEX)) {
    const fullMatch = m[1]
    const preceding = m[0][0]

    // Skip if preceded by a word character (e.g. font-size:0x...)
    if (/\w/.test(preceding)) continue

    const result = hexToRgb(fullMatch)
    if (!result) continue

    const start = (m.index ?? 0) + 1 // +1 for the captured preceding char
    const end = start + fullMatch.length
    const color = rgbString(result.r, result.g, result.b, result.a)

    matches.push({ start, end, color })
  }

  return matches
}

/**
 * Detect hex colors in ARGB mode.
 * For 8-digit and 4-digit hex: first digits are alpha.
 */
export function findHexARGB(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(HEX_REGEX)) {
    const fullMatch = m[1]
    const preceding = m[0][0]

    if (/\w/.test(preceding)) continue

    const result = hexARGBToRgb(fullMatch)
    if (!result) continue

    const start = (m.index ?? 0) + 1
    const end = start + fullMatch.length
    const color = rgbString(result.r, result.g, result.b, result.a)

    matches.push({ start, end, color })
  }

  return matches
}
