import type { ColorMatch, StrategyContext } from '../types'
import { hexToRgb, hexARGBToRgb, rgbString } from '../utils/color'

/**
 * Regex for hex colors: #RGB, #RRGGBB, #RGBA, #RRGGBBAA, and 0x prefix.
 * The leading `.?` captures one preceding char to filter false positives.
 * Named backreference is not needed here; we check the preceding char manually.
 */
const HEX_REGEX =
  /(?<prefix>.?)(?<hex>(?:#|0x)(?:[a-f0-9]{6}(?:[a-f0-9]{2})?|[a-f0-9]{3}(?:[a-f0-9])?))\b/giu

/**
 * Check whether a numeric `0x` hex literal is too short to be a color.
 *
 * @param hex - The matched hex literal
 * @returns Whether the literal should be skipped
 */
function isShortNumericHex(hex: string): boolean {
  return hex.toLowerCase().startsWith('0x') && hex.length <= 6
}

/**
 * Check whether a hex match is handled by the Dart-specific color strategy.
 *
 * @param text - The source text containing the match
 * @param start - The start offset of the matched hex literal
 * @param context - Optional strategy context with language metadata
 * @returns Whether the match is inside a Dart `Color(...)` constructor
 */
function isDartColorConstructorHex(
  text: string,
  start: number,
  context?: StrategyContext,
): boolean {
  if (context?.languageId !== 'dart') return false
  return /Color\(\s*$/u.test(text.slice(Math.max(0, start - 16), start))
}

/**
 * Detect hex colors in RGBA mode (default).
 * Matches #RGB, #RRGGBB, #RGBA, #RRGGBBAA and 0x prefix variants.
 *
 * @param text - The document text to scan for hex colors
 * @param context - Optional strategy context with language metadata
 * @returns Array of color matches found in the text
 */
export function findHexRGBA(
  text: string,
  context?: StrategyContext,
): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(HEX_REGEX)) {
    const fullMatch = m.groups?.hex
    if (!fullMatch) continue

    const preceding = m.groups?.prefix ?? ''

    // Skip if preceded by a word character (e.g. font-size:0x...)
    if (/\w/u.test(preceding)) continue
    if (isShortNumericHex(fullMatch)) continue

    const result = hexToRgb(fullMatch)
    if (!result) continue

    const start = (m.index ?? 0) + preceding.length
    if (isDartColorConstructorHex(text, start, context)) continue

    const end = start + fullMatch.length
    const color = rgbString(result.r, result.g, result.b, result.a)

    matches.push({ start, end, color })
  }

  return matches
}

/**
 * Detect hex colors in ARGB mode.
 * For 8-digit and 4-digit hex: first digits are alpha.
 *
 * @param text - The document text to scan for hex colors
 * @param context - Optional strategy context with language metadata
 * @returns Array of color matches found in the text
 */
export function findHexARGB(
  text: string,
  context?: StrategyContext,
): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(HEX_REGEX)) {
    const fullMatch = m.groups?.hex
    if (!fullMatch) continue

    const preceding = m.groups?.prefix ?? ''

    if (/\w/u.test(preceding)) continue
    if (isShortNumericHex(fullMatch)) continue

    const result = hexARGBToRgb(fullMatch)
    if (!result) continue

    const start = (m.index ?? 0) + preceding.length
    if (isDartColorConstructorHex(text, start, context)) continue

    const end = start + fullMatch.length
    const color = rgbString(result.r, result.g, result.b, result.a)

    matches.push({ start, end, color })
  }

  return matches
}
