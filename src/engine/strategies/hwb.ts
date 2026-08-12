import type { ColorMatch } from '../detection'
import { formatCssColor, parseHwbColor } from './css-color/parser'

const HWB_FUNCTION_REGEX = /(?<source>hwb\([^)]*\))/giu

/** Detect modern CSS hwb() functions. */
export function findHwb(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []
  for (const match of text.matchAll(HWB_FUNCTION_REGEX)) {
    const source = match.groups?.source
    const start = match.index ?? 0
    if (!source || (start > 0 && /[-\w]/u.test(text[start - 1]))) {
      continue
    }
    const parsed = parseHwbColor(source)
    if (!parsed) {
      continue
    }
    matches.push({
      start,
      end: start + source.length,
      color: formatCssColor(parsed),
    })
  }
  return matches
}
