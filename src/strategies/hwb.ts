import { hwbToRgb, rgbString } from '../color/convert'
import type { ColorMatch } from '../core/types'

/**
 * Regex for hwb() color function.
 * hwb(hue, whiteness%, blackness%[, alpha])
 */
const HWB_REGEX =
  /(?<hwbFunc>hwb\(\s*\d+(?:\.\d+)?(?:deg|grad|rad|turn)?\s*,\s*(?:100(?:\.0+)?|0*\d{1,2}(?:\.\d+)?)%\s*,\s*(?:100(?:\.0+)?|0*\d{1,2}(?:\.\d+)?)%(?:\s*,\s*0?\.?\d+%?)?\s*\))/giu

/**
 * Also match space-delimited hwb() syntax:
 * hwb(hue whiteness% blackness%[/ alpha])
 */
const HWB_SPACE_REGEX =
  /(?<hwbFunc>hwb\(\s*\d+(?:\.\d+)?(?:deg|grad|rad|turn)?\s+(?:100(?:\.0+)?|0*\d{1,2}(?:\.\d+)?)%\s+(?:100(?:\.0+)?|0*\d{1,2}(?:\.\d+)?)%(?:\s*\/\s*[\d.]+%?)?\s*\))/giu

/**
 * Detect hwb() color functions.
 *
 * @param text - The document text to scan for hwb() colors
 * @returns Array of color matches found in the text
 */
export function findHwb(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(HWB_REGEX)) {
    const fullMatch = m.groups?.hwbFunc
    if (!fullMatch) continue

    const start = m.index ?? 0
    const end = start + fullMatch.length
    const color = parseHwb(fullMatch)
    if (color) matches.push({ start, end, color })
  }

  for (const m of text.matchAll(HWB_SPACE_REGEX)) {
    const fullMatch = m.groups?.hwbFunc
    if (!fullMatch) continue

    const start = m.index ?? 0
    const end = start + fullMatch.length
    const color = parseHwb(fullMatch)
    if (color) matches.push({ start, end, color })
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
  const num = Number(value.replace(/(?:deg|grad|rad|turn)$/u, ''))
  if (value.endsWith('grad')) return (num * 360) / 400
  if (value.endsWith('rad')) return (num * 180) / Math.PI
  if (value.endsWith('turn')) return num * 360
  return num
}

/**
 * Parse an hwb() function string and convert to RGB.
 *
 * @param func - The full hwb() function string
 * @returns The resolved rgb() color string, or null if parsing fails
 */
function parseHwb(func: string): string | null {
  const innerMatch = func.match(
    /^hwb\(\s*(?<hue>\d+(?:\.\d+)?(?:deg|grad|rad|turn)?)\s*[, ]\s*(?<whiteness>100(?:\.0+)?|\d{1,2}(?:\.\d+)?)%\s*[, ]\s*(?<blackness>100(?:\.0+)?|\d{1,2}(?:\.\d+)?)%(?:\s*[,/]\s*(?<alpha>[\d.]+%?))?\s*\)$/iu,
  )
  if (!innerMatch) return null

  const {
    alpha: alphaString,
    blackness,
    hue,
    whiteness,
  } = innerMatch.groups ?? {}
  if (!hue || !whiteness || !blackness) return null

  const h = parseAngle(hue)
  const w = Number(whiteness) / 100
  const b = Number(blackness) / 100

  if (w < 0 || w > 1 || b < 0 || b > 1) return null

  let alpha: number | undefined
  if (alphaString) {
    alpha = alphaString.endsWith('%')
      ? Number(alphaString.slice(0, -1)) / 100
      : Number(alphaString)
  }

  const [r, g, bl] = hwbToRgb(h, w, b)
  return rgbString(r, g, bl, alpha)
}
