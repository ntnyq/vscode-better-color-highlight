import type { ColorMatch, ColorMatchGroup } from '../types'

/**
 * Group color matches by their resolved color string.
 * Each unique color gets its own array of matches.
 * @param matches - Array of color matches to group
 * @returns An object mapping each resolved color string to its matches
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
 * @param matchArrays - Multiple arrays of color matches to merge
 * @returns A deduplicated array of color matches
 */
export function mergeMatches(
  ...matchArrays: readonly (readonly ColorMatch[])[]
): ColorMatch[] {
  const seen = new Set<string>()
  const result: ColorMatch[] = []

  for (const arr of matchArrays) {
    for (const match of arr) {
      const key = `${match.start}:${match.end}:${match.color}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push(match)
      }
    }
  }

  return result
}
