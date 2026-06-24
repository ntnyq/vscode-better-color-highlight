import type { ColorMatch } from '../types'
import {
  colorSpaceToRgb,
  hexToRgb,
  hslToRgb,
  lchToRgb,
  oklchToRgb,
  labToRgb,
  oklabToRgb,
  parsePercent,
  rgbString,
} from '../utils/color'

/**
 * Regex for CSS color functions: rgb(), hsl(), lch(), oklch(), lab(), oklab()
 * with optional alpha variants.
 *
 * Uses named backreference `sep` to enforce consistent separator style
 * (comma-delimited OR space-delimited, not mixed).
 */
const COLOR_FUNC_REGEX =
  /(?<colorFunc>(?:rgba?|hsla?|lcha?|oklcha?|laba?|oklaba?)\(\s*[-+]?[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?\s*(?<sep>[\s,])\s*[-+]?[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?\s*\k<sep>\s*[-+]?[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?(?:\s*(?:\k<sep>|\/)\s*[-+]?[\d.*]*\.?[\d]+%?)?\s*\))/giu

/**
 * Regex for CSS Color 4 color() syntax:
 *   color(display-p3 1 0 0)
 *   color(srgb 1 0 0 / 0.5)
 */
const COLOR_SPACE_FUNC_REGEX =
  /(?<colorSpaceFunc>color\(\s*(?:srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz(?:-d50|-d65)?)\s+[-+]?[\d.*]*\.?[\d]+%?\s+[-+]?[\d.*]*\.?[\d]+%?\s+[-+]?[\d.*]*\.?[\d]+%?(?:\s*\/\s*[-+]?[\d.*]*\.?[\d]+%?)?\s*\))/giu

/**
 * Regex for Hyprland's rgba(rrggbb) and rgba(rrggbbaa) syntax.
 */
const HYPRLAND_RGBA_HEX_REGEX =
  /(?<hyprlandRgba>rgba\(\s*(?<hex>[a-f0-9]{6}(?:[a-f0-9]{2})?)\s*\))/giu

/**
 * Regex for CSS custom property color shorthands:
 *   --color-rgb: 255 0 0;
 *   --color-hsl: 0 100% 50%;
 */
const CSS_VAR_SHORTHAND_REGEX =
  /(?<propName>--[\w-]+-(?:rgb|hsl|lch|oklch|lab|oklab))\s*:\s*(?<value>[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?\s+[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?\s+[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?(?:\s*\/\s*[\d.*]*\.?[\d]+%?)?)\s*;/giu

/**
 * Supported shorthand color spaces for bare channel values.
 */
type ShorthandSpace = 'rgb' | 'hsl' | 'lch' | 'oklch' | 'lab' | 'oklab'

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
    return Number(trimmed.slice(0, -1)) / 100
  }

  if (type === 'angle') {
    return parseAngle(trimmed)
  }

  return Number(trimmed)
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
    const fullMatch = m.groups?.colorFunc
    if (!fullMatch) continue

    const start = m.index ?? 0
    if (start > 0 && /[-\w]/u.test(text[start - 1])) continue

    const end = start + fullMatch.length

    const color = parseColorFunction(fullMatch)
    if (!color) continue

    matches.push({ start, end, color })
  }

  // CSS Color 4 color() function syntax
  for (const m of text.matchAll(COLOR_SPACE_FUNC_REGEX)) {
    const fullMatch = m.groups?.colorSpaceFunc
    if (!fullMatch) continue

    const start = m.index ?? 0
    const end = start + fullMatch.length

    const color = parseColorFunction(fullMatch)
    if (!color) continue

    matches.push({ start, end, color })
  }

  matches.push(...findHyprlandRgbaHexColors(text))

  // CSS variable shorthand: --color-rgb: 255 0 0;
  for (const m of text.matchAll(CSS_VAR_SHORTHAND_REGEX)) {
    const propName = m.groups?.propName
    const value = m.groups?.value
    if (!propName || !value) continue

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
 * Detect Hyprland rgba(hex) colors.
 *
 * @param text - The document text to scan
 * @returns Array of color matches found in Hyprland rgba(hex) syntax
 */
function findHyprlandRgbaHexColors(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(HYPRLAND_RGBA_HEX_REGEX)) {
    const fullMatch = m.groups?.hyprlandRgba
    const hex = m.groups?.hex
    if (!fullMatch || !hex) continue

    const start = m.index ?? 0
    if (start > 0 && /[-\w]/u.test(text[start - 1])) continue

    const result = hexToRgb(`#${hex}`)
    if (!result) continue

    const end = start + fullMatch.length
    const color = rgbString(result.r, result.g, result.b, result.a)

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
  if (func.toLowerCase().startsWith('color(')) {
    return parseColorSpaceFunction(func)
  }

  const fnMatch = func.match(
    /^(?<name>rgba?|hsla?|lcha?|oklcha?|laba?|oklaba?)\((?<args>.*)\)$/iu,
  )
  if (!fnMatch) return null

  const fn = fnMatch.groups?.name?.toLowerCase()
  const args = fnMatch.groups?.args
  if (!fn || args === undefined) return null

  // Split args respecting the separator style
  const hasComma = args.includes(',')
  const parts = hasComma
    ? args.split(',').map(s => s.trim())
    : args.split(/\s+/u).map(s => s.trim())

  // Handle slash-separated alpha in space-delimited syntax
  let alpha: number | undefined
  if (!hasComma) {
    const slashIndex = parts.indexOf('/')
    if (slashIndex === -1) {
      const lastPart = parts[parts.length - 1]
      if (lastPart.includes('/')) {
        const [value, a] = lastPart.split('/')
        parts[parts.length - 1] = value.trim()
        alpha = parseChannelValue(a.trim(), 'percent')
      }
    } else {
      const alphaPart = parts[slashIndex + 1]
      if (alphaPart) {
        alpha = parseChannelValue(alphaPart, 'percent')
      }
      parts.splice(slashIndex)
    }
  }
  // Handle comma-separated alpha
  else if (parts.length === 4) {
    alpha = parseChannelValue(parts[3], 'percent')
    parts.pop()
  }

  const [r, g, b] = convertColorFunction(fn, parts)
  if (r === null) return null

  return rgbString(r, g, b, alpha)
}

/**
 * Parse a CSS Color 4 color() function string.
 *
 * @param func - The full color() function string
 * @returns The resolved rgb() color string, or null if parsing fails
 */
function parseColorSpaceFunction(func: string): string | null {
  const fnMatch = func.match(/^color\(\s*(?<space>[\w-]+)\s+(?<args>.+)\)$/iu)
  if (!fnMatch) return null

  const space = fnMatch.groups?.space?.toLowerCase()
  let args = fnMatch.groups?.args?.trim()
  if (!space || !args) return null

  let alpha: number | undefined
  if (args.includes('/')) {
    const [channels, a] = args.split('/')
    args = channels.trim()
    alpha = parseChannelValue(a.trim(), 'percent')
  }

  const parts = args.split(/\s+/u).filter(Boolean)
  if (parts.length < 3) return null

  const c1 = parsePercent(parts[0])
  const c2 = parsePercent(parts[1])
  const c3 = parsePercent(parts[2])

  const [r, g, b] = colorSpaceToRgb(space, c1, c2, c3)
  if (r === null) return null

  return rgbString(r, g, b, alpha)
}

/**
 * Infer a shorthand color space from a variable or property name.
 *
 * @param name - Optional variable or property name hint
 * @returns The inferred shorthand color space, or null when unknown
 */
function inferShorthandSpace(name?: string): ShorthandSpace | null {
  if (!name) return null

  const lower = name.toLowerCase()
  const match = lower.match(/(?:^|[-_])(?<space>oklch|oklab|rgb|hsl|lch|lab)$/u)
  return (match?.groups?.space as ShorthandSpace | undefined) ?? null
}

/**
 * Resolve raw shorthand values such as "255 0 0" or "0 100% 50%".
 * Uses an explicit variable-name hint when available, with safe heuristics as fallback.
 *
 * @param value - The raw shorthand value to resolve
 * @param hint - Optional variable or property name hint
 * @returns The resolved rgb() color string, or null if parsing fails
 */
export function resolveShorthandColor(
  value: string,
  hint?: string,
): string | null {
  const normalized = value.replaceAll(/!important\b/gu, '').trim()
  const parts = normalized.split(/\s+/u).filter(Boolean)

  if (parts.length < 3) {
    return null
  }

  let space = inferShorthandSpace(hint)

  if (!space) {
    const looksLikeHsl = parts[1]?.endsWith('%') && parts[2]?.endsWith('%')
    const looksLikeRgb = parts.slice(0, 3).every(part => !part.endsWith('%'))

    if (looksLikeHsl) {
      space = 'hsl'
    } else if (looksLikeRgb) {
      space = 'rgb'
    }
  }

  return space ? parseShorthandValue(normalized, space) : null
}

/**
 * Convert parsed function arguments to RGB based on the color space.
 *
 * @param fn - The color function name, e.g. 'rgb', 'hsl', or 'lch'
 * @param parts - Array of raw string arguments from the color function
 * @returns RGB tuple [r, g, b] or [null, null, null] if conversion fails
 */
function convertColorFunction(
  fn: string,
  parts: string[],
): [number, number, number] | [null, null, null] {
  switch (fn.replace(/a$/u, '')) {
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
export function parseShorthandValue(
  value: string,
  space: ShorthandSpace,
): string | null {
  const parts = value.trim().split(/\s+/u)

  // Handle slash-separated alpha
  let alpha: number | undefined
  const slashIndex = parts.indexOf('/')
  if (slashIndex === -1) {
    const lastPart = parts[parts.length - 1]
    if (lastPart.includes('/')) {
      const [channel, a] = lastPart.split('/')
      parts[parts.length - 1] = channel
      alpha = parseChannelValue(a.trim(), 'percent')
    }
  } else {
    const alphaPart = parts[slashIndex + 1]
    if (alphaPart) {
      alpha = parseChannelValue(alphaPart, 'percent')
    }
    parts.splice(slashIndex)
  }

  const [r, g, b] = convertColorFunction(space, parts)
  if (r === null) return null
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null
  }
  if (alpha !== undefined && !Number.isFinite(alpha)) return null

  return rgbString(r, g, b, alpha)
}
