import { hexARGBToRgb, rgbString } from '../color/convert'
import type { ColorMatch } from '../core/types'

/**
 * Regex for Flutter `Color(0xffRRGGBB)` constructor calls.
 */
const DART_COLOR_HEX_REGEX = /(?<full>Color\(\s*(?<hex>0x[a-f0-9]{8})\s*\))/giu

/**
 * Regex for Flutter `Color.fromARGB(a, r, g, b)` constructor calls.
 */
const DART_COLOR_FROM_ARGB_REGEX =
  /(?<full>Color\.fromARGB\(\s*(?<alpha>\d{1,3})\s*,\s*(?<red>\d{1,3})\s*,\s*(?<green>\d{1,3})\s*,\s*(?<blue>\d{1,3})\s*\))/gu

/**
 * Check whether a numeric channel is a valid 8-bit byte.
 *
 * @param value - The channel value to validate
 * @returns Whether the value is an integer in [0, 255]
 */
function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255
}

/**
 * Detect Flutter/Dart color constructor calls.
 *
 * @param text - The document text to scan for Dart colors
 * @returns Array of color matches found in the text
 */
export function findDartColors(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(DART_COLOR_HEX_REGEX)) {
    const fullMatch = m.groups?.full
    const hex = m.groups?.hex
    if (!fullMatch || !hex) continue

    const result = hexARGBToRgb(hex)
    if (!result) continue

    matches.push({
      start: m.index ?? 0,
      end: (m.index ?? 0) + fullMatch.length,
      color: rgbString(result.r, result.g, result.b, result.a),
    })
  }

  for (const m of text.matchAll(DART_COLOR_FROM_ARGB_REGEX)) {
    const fullMatch = m.groups?.full
    const alpha = Number(m.groups?.alpha)
    const red = Number(m.groups?.red)
    const green = Number(m.groups?.green)
    const blue = Number(m.groups?.blue)
    if (!fullMatch) continue
    if (![alpha, red, green, blue].every(isByte)) continue

    matches.push({
      start: m.index ?? 0,
      end: (m.index ?? 0) + fullMatch.length,
      color: rgbString(red, green, blue, alpha / 255),
    })
  }

  return matches
}
