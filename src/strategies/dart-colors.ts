import { hexARGBToRgb, rgbString } from '../color/convert'
import type { ColorMatch } from '../core/types'

const DART_COLOR_HEX_REGEX = /(?<full>Color\(\s*(?<hex>0x[a-f0-9]{8})\s*\))/giu

const DART_COLOR_FROM_ARGB_REGEX =
  /(?<full>Color\.fromARGB\(\s*(?<alpha>\d{1,3})\s*,\s*(?<red>\d{1,3})\s*,\s*(?<green>\d{1,3})\s*,\s*(?<blue>\d{1,3})\s*\))/gu

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255
}

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
