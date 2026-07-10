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
