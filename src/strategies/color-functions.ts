import {
  hslToRgb,
  lchToRgb,
  oklchToRgb,
  labToRgb,
  oklabToRgb,
  rgbString,
} from '../color/convert'
import type { ColorMatch } from '../core/types'

/**
 * Regex for CSS color functions: rgb(), hsl(), lch(), oklch(), lab(), oklab()
 * with optional alpha variants.
 *
 * Uses named backreference `sep` to enforce consistent separator style
 * (comma-delimited OR space-delimited, not mixed).
 *
 * Also matches CSS variable shorthand form:
 *   --color-rgb: 255 0 0;
 *   --color-hsl: 210 50% 50%;
 */
const COLOR_FUNC_REGEX =
  /((?:rgba?|hsla?|lcha?|oklcha?|laba?|oklaba?)\(\s*[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?\s*(?<sep>[\s,])\s*[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?\s*\k<sep>\s*[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?(?:\s*(?:\k<sep>|\/)\s*[\d.*]*\.?[\d]+%?)?\s*\))/gi

/**
 * Regex for CSS custom property color shorthands:
 *   --color-rgb: 255 0 0;
 *   --color-hsl: 0 100% 50%;
 */
const CSS_VAR_SHORTHAND_REGEX =
  /(--[\w-]+-(?:rgb|hsl|lch|oklch|lab|oklab))\s*:\s*([\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?\s+[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?\s+[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?(?:\s*\/\s*[\d.*]*\.?[\d]+%?)?)\s*;/gi

/**
 * Parse a single numeric value from a color function argument.
 * Handles percentages, degrees, and plain numbers.
 *
 * @param value - The raw string value from the color function argument
 * @param type - The expected value type: 'rgb', 'angle', 'percent', or 'number'
 * @returns The parsed numeric value
 */
function parseChannelValue(
  value: string,
  type: 'rgb' | 'angle' | 'percent' | 'number',
): number {
  const trimmed = value.trim()

  if (trimmed.endsWith('%')) {
    return Number.parseFloat(trimmed) / 100
  }

  if (type === 'angle') {
    return parseAngle(trimmed)
  }

  return Number.parseFloat(trimmed)
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
  return num // default: degrees
}

/**
 * Detect CSS color functions: rgb(), rgba(), hsl(), hsla(), lch(), lcha(),
 * oklch(), oklcha(), lab(), laba(), oklab(), oklaba().
 *
 * @param text - The document text to scan for color functions
 * @returns Array of color matches found in the text
 */
export function findColorFunctions(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(COLOR_FUNC_REGEX)) {
    const fullMatch = m[1]
    const start = m.index ?? 0
    const end = start + fullMatch.length

    const color = parseColorFunction(fullMatch)
    if (!color) continue

    matches.push({ start, end, color })
  }

  // CSS variable shorthand: --color-rgb: 255 0 0;
  for (const m of text.matchAll(CSS_VAR_SHORTHAND_REGEX)) {
    const propName = m[1]
    const value = m[2]
    const fullMatch = m[0]

    const start = m.index ?? 0
    const end = start + fullMatch.length

    // Determine the color space from the property name suffix
    const space = propName.split('-').pop() as
      | 'rgb'
      | 'hsl'
      | 'lch'
      | 'oklch'
      | 'lab'
      | 'oklab'

    const color = parseShorthandValue(value, space)
    if (!color) continue

    matches.push({ start, end, color })
  }

  return matches
}

/**
 * Parse a CSS color function string like "rgb(255, 0, 0)" or "hsl(210, 50%, 50%)".
 *
 * @param func - The full color function string including name and arguments
 * @returns The resolved rgb() color string, or null if parsing fails
 */
function parseColorFunction(func: string): string | null {
  const fnMatch = func.match(
    /^(rgba?|hsla?|lcha?|oklcha?|laba?|oklaba?)\((.*)\)$/i,
  )
  if (!fnMatch) return null

  const fn = fnMatch[1].toLowerCase()
  const args = fnMatch[2]

  // Split args respecting the separator style
  const hasComma = args.includes(',')
  const parts = hasComma
    ? args.split(',').map(s => s.trim())
    : args.split(/\s+/).map(s => s.trim())

  // Handle slash-separated alpha in space-delimited syntax
  let alpha: number | undefined
  const lastPart = parts[parts.length - 1]
  if (!hasComma && lastPart.includes('/')) {
    const [value, a] = lastPart.split('/')
    parts[parts.length - 1] = value.trim()
    alpha = parseChannelValue(a.trim(), 'percent')
  }
  // Handle comma-separated alpha
  else if (parts.length === 4 && hasComma) {
    alpha = parseChannelValue(parts[3], 'percent')
    parts.pop()
  }

  const [r, g, b] = convertColorFunction(fn, parts)
  if (r === null) return null

  return rgbString(r, g, b, alpha)
}

/**
 * Convert parsed function arguments to RGB based on the color space.
 *
 * @param fn - The color function name (e.g. 'rgb', 'hsl', 'lch')
 * @param parts - Array of raw string arguments from the color function
 * @returns RGB tuple [r, g, b] or [null, null, null] if conversion fails
 */
function convertColorFunction(
  fn: string,
  parts: string[],
): [number, number, number] | [null, null, null] {
  switch (fn.replace(/a$/, '')) {
    case 'rgb': {
      const r = parseChannelValue(parts[0], 'rgb')
      const g = parseChannelValue(parts[1], 'rgb')
      const b = parseChannelValue(parts[2], 'rgb')
      // Percentage in rgb means 0-255 mapped from 0%-100%
      return [
        r <= 1 ? Math.round(r * 255) : Math.round(r),
        g <= 1 ? Math.round(g * 255) : Math.round(g),
        b <= 1 ? Math.round(b * 255) : Math.round(b),
      ]
    }
    case 'hsl': {
      const h = parseChannelValue(parts[0], 'angle')
      const s = parseChannelValue(parts[1], 'percent')
      const l = parseChannelValue(parts[2], 'percent')
      return hslToRgb(h, s, l)
    }
    case 'lch': {
      const L = parseChannelValue(parts[0], 'number')
      const C = parseChannelValue(parts[1], 'number')
      const H = parseChannelValue(parts[2], 'angle')
      return lchToRgb(L, C, H)
    }
    case 'oklch': {
      const L = parseChannelValue(parts[0], 'number')
      const C = parseChannelValue(parts[1], 'number')
      const H = parseChannelValue(parts[2], 'angle')
      return oklchToRgb(L, C, H)
    }
    case 'lab': {
      const L = parseChannelValue(parts[0], 'number')
      const a = parseChannelValue(parts[1], 'number')
      const b = parseChannelValue(parts[2], 'number')
      return labToRgb(L, a, b)
    }
    case 'oklab': {
      const L = parseChannelValue(parts[0], 'number')
      const a = parseChannelValue(parts[1], 'number')
      const b = parseChannelValue(parts[2], 'number')
      return oklabToRgb(L, a, b)
    }
    default: {
      return [null, null, null]
    }
  }
}

/**
 * Parse a CSS variable shorthand value like "255 0 0" or "0 100% 50%".
 *
 * @param value - The shorthand value string
 * @param space - The color space identifier
 * @returns The resolved rgb() color string, or null if parsing fails
 */
function parseShorthandValue(
  value: string,
  space: 'rgb' | 'hsl' | 'lch' | 'oklch' | 'lab' | 'oklab',
): string | null {
  const parts = value.trim().split(/\s+/)

  // Handle slash-separated alpha
  let alpha: number | undefined
  const lastPart = parts[parts.length - 1]
  if (lastPart.includes('/')) {
    const [, a] = lastPart.split('/')
    parts[parts.length - 1] = parts[parts.length - 1].split('/')[0]
    alpha = parseChannelValue(a.trim(), 'percent')
  }

  const [r, g, b] = convertColorFunction(space, parts)
  if (r === null) return null

  return rgbString(r, g, b, alpha)
}
