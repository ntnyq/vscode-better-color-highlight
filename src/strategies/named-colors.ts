import { rgbString } from '../color/convert'
import { NAMED_COLORS } from '../color/named-color-map'
import type { ColorMatch, StrategyContext } from '../core/types'

/**
 * Regex for CSS named color keywords.
 * Built dynamically from the named color map.
 * Sort names by length descending to avoid partial matches (e.g. "gray" before "grey").
 * Skip matches preceded by -, $, @, # (variable prefixes).
 * Negative lookahead (?!-) prevents matching partial hyphenated names.
 */
const NAMED_COLOR_REGEX = buildNamedColorRegex()
const CSS_LIKE_LANGUAGES = new Set(['css', 'scss', 'sass', 'less'])
const CSS_DECLARATION_HEAD_REGEX =
  /^\s*(?:(?:[$@]?[-_a-z][-\w]*)|(?:--[-\w]+))\s*:/iu

/**
 * Build a regex that matches any CSS named color keyword.
 * Names are sorted by length descending to avoid partial matches.
 *
 * @returns A RegExp that captures named color keywords
 */
function buildNamedColorRegex(): RegExp {
  const names = [...NAMED_COLORS.keys()]
    .sort((a, b) => b.length - a.length)
    .join('|')
  return new RegExp(`(^|[^-\\w$@#])(\\b(?:${names})\\b)(?!-)`, 'giu')
}

/**
 * Detect CSS named color keywords (e.g. "red", "blue", "rebeccapurple").
 * Skips matches preceded by variable prefixes (-, $, @, #).
 *
 * @param text - The document text to scan for named colors
 * @returns Array of color matches found in the text
 */
export function findNamedColors(
  text: string,
  context?: StrategyContext,
): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(NAMED_COLOR_REGEX)) {
    const prefix = m[1] ?? ''
    const name = m[2]

    const rgb = NAMED_COLORS.get(name.toLowerCase())
    if (!rgb) continue

    const start = (m.index ?? 0) + prefix.length
    const end = start + name.length
    if (!isNamedColorAllowed(text, start, context)) continue

    const color = rgbString(rgb[0], rgb[1], rgb[2])

    matches.push({ start, end, color })
  }

  return matches
}

function isNamedColorAllowed(
  text: string,
  start: number,
  context?: StrategyContext,
): boolean {
  if (context?.namedColorMatchMode === 'always') {
    return true
  }

  if (!context || !CSS_LIKE_LANGUAGES.has(context.languageId)) {
    return true
  }

  return isInCssDeclarationValue(text, start)
}

function isInCssDeclarationValue(text: string, start: number): boolean {
  const boundary = Math.max(
    text.lastIndexOf('{', start),
    text.lastIndexOf('}', start),
    text.lastIndexOf(';', start),
  )
  const declarationSegment = text.slice(boundary + 1, start)

  return CSS_DECLARATION_HEAD_REGEX.test(stripCssComments(declarationSegment))
}

function stripCssComments(text: string): string {
  return text
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/\/\/[^\n\r]*/gu, '')
}
