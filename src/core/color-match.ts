import type { ColorMatch, ColorMatchGroup } from './types'

/**
 * Group color matches by their resolved color string.
 * Each unique color gets its own array of matches.
 */
export function groupByColor(matches: readonly ColorMatch[]): ColorMatchGroup {
  const groups: ColorMatchGroup = {}

  for (const match of matches) {
    const { color } = match
    if (!groups[color]) {
      groups[color] = []
    }
    groups[color].push(match)
  }

  return groups
}

/**
 * Merge multiple arrays of color matches, removing duplicates by offset.
 * Earlier arrays take priority over later ones (first match wins).
 */
export function mergeMatches(
  ...matchArrays: readonly (readonly ColorMatch[])[]
): ColorMatch[] {
  const seen = new Set<number>()
  const result: ColorMatch[] = []

  for (const arr of matchArrays) {
    for (const match of arr) {
      if (!seen.has(match.start)) {
        seen.add(match.start)
        result.push(match)
      }
    }
  }

  return result
}
