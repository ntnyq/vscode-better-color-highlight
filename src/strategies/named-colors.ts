import { rgbString } from '../color/convert'
import { NAMED_COLORS } from '../color/named-color-map'
import type { ColorMatch } from '../core/types'

/**
 * Regex for CSS named color keywords.
 * Built dynamically from the named color map.
 * Sort names by length descending to avoid partial matches (e.g. "gray" before "grey").
 * Skip matches preceded by -, $, @, # (variable prefixes).
 * Negative lookahead (?!-) prevents matching partial hyphenated names.
 */
const NAMED_COLOR_REGEX = buildNamedColorRegex()

function buildNamedColorRegex(): RegExp {
  const names = [...NAMED_COLORS.keys()]
    .sort((a, b) => b.length - a.length)
    .join('|')
  // .? captures one preceding char for filtering
  return new RegExp(`.?(\\b(?:${names})\\b)(?!-)`, 'gi')
}

/**
 * Detect CSS named color keywords (e.g. "red", "blue", "rebeccapurple").
 * Skips matches preceded by variable prefixes (-, $, @, #).
 */
export function findNamedColors(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const m of text.matchAll(NAMED_COLOR_REGEX)) {
    const name = m[1]
    const preceding = m[0][0]

    // Skip if preceded by variable prefix characters
    if ('-$@#'.includes(preceding)) continue
    if (/\w/.test(preceding)) continue

    const rgb = NAMED_COLORS.get(name.toLowerCase())
    if (!rgb) continue

    const start = (m.index ?? 0) + 1 // +1 for the captured preceding char
    const end = start + name.length
    const color = rgbString(rgb[0], rgb[1], rgb[2])

    matches.push({ start, end, color })
  }

  return matches
}
