import { hexToRgb, rgbString } from '../../shared/color'
import type { ColorMatch } from '../detection'
import { arbitrateColorMatches } from '../detection/color-match'
import {
  formatCssColor,
  parseCssColorExpression,
  scanCssColorFunctions,
} from './css-color/parser'

const HYPRLAND_RGBA_HEX_REGEX =
  /(?<hyprlandRgba>rgba\(\s*(?<hex>[a-f\d]{6}(?:[a-f\d]{2})?)\s*\))/giu

const CSS_VAR_SHORTHAND_REGEX =
  /(?<propName>--[\w-]+-(?:rgb|hsl|lch|oklch|lab|oklab))\s*:\s*(?<value>[-+]?[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?\s+[-+]?[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?\s+[-+]?[\d.*]*\.?[\d]+(?:%|deg|grad|rad|turn)?(?:\s*\/\s*[-+]?[\d.*]*\.?[\d]+%?)?)\s*;/giu

type ShorthandSpace = 'hsl' | 'lab' | 'lch' | 'oklab' | 'oklch' | 'rgb'

/** Detect balanced, statically resolvable CSS color functions. */
export function findColorFunctions(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const candidate of scanCssColorFunctions(text)) {
    const parsed = parseCssColorExpression(candidate.source)
    if (!parsed) {
      continue
    }
    matches.push({
      start: candidate.start,
      end: candidate.end,
      color: formatCssColor(parsed),
    })
  }

  matches.push(
    ...findHyprlandRgbaHexColors(text),
    ...findCssVariableShorthands(text),
  )
  return arbitrateColorMatches(matches)
}

/** Resolve raw shorthand values such as "255 0 0" or "0 100% 50%". */
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

/** Parse a CSS custom-property channel shorthand. */
export function parseShorthandValue(
  value: string,
  space: ShorthandSpace,
): string | null {
  const parsed = parseCssColorExpression(`${space}(${value.trim()})`)
  return parsed ? formatCssColor(parsed) : null
}

function findHyprlandRgbaHexColors(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []
  for (const match of text.matchAll(HYPRLAND_RGBA_HEX_REGEX)) {
    const fullMatch = match.groups?.hyprlandRgba
    const hex = match.groups?.hex
    if (!fullMatch || !hex) {
      continue
    }
    const start = match.index ?? 0
    if (start > 0 && /[-\w]/u.test(text[start - 1])) {
      continue
    }
    const result = hexToRgb(`#${hex}`)
    if (!result) {
      continue
    }
    matches.push({
      start,
      end: start + fullMatch.length,
      color: rgbString(result.r, result.g, result.b, result.a),
    })
  }
  return matches
}

function findCssVariableShorthands(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []
  for (const match of text.matchAll(CSS_VAR_SHORTHAND_REGEX)) {
    const propertyName = match.groups?.propName
    const value = match.groups?.value
    if (!propertyName || !value) {
      continue
    }
    const space = propertyName.split('-').pop() as ShorthandSpace
    const color = parseShorthandValue(value, space)
    if (!color) {
      continue
    }
    const start = match.index ?? 0
    matches.push({ start, end: start + match[0].length, color })
  }
  return matches
}

function inferShorthandSpace(name?: string): ShorthandSpace | null {
  if (!name) {
    return null
  }
  const match = name
    .toLowerCase()
    .match(/(?:^|[-_])(?<space>oklch|oklab|rgb|hsl|lch|lab)$/u)
  return (match?.groups?.space as ShorthandSpace | undefined) ?? null
}
