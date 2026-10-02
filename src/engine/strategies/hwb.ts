import type { ColorMatch } from '../detection'
import {
  formatCssColor,
  parseHwbColor,
  scanCssColorFunctions,
} from './css-color/parser'

/**
 * Detect modern CSS hwb() functions.
 */
export function findHwb(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []
  for (const { name, source, start, end } of scanCssColorFunctions(text)) {
    if (name !== 'hwb') {
      continue
    }
    const parsed = parseHwbColor(source)
    if (!parsed) {
      continue
    }
    matches.push({
      start,
      end,
      color: formatCssColor(parsed),
    })
  }
  return matches
}
