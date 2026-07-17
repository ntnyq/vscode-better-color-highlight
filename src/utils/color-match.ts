import type { ColorMatch, ColorMatchGroup } from '../types'

export interface ColorMatchGroupLimits {
  /** Maximum number of unique colors to retain. */
  readonly maxColorCount: number

  /** Maximum total number of matches to retain. */
  readonly maxMatchCount: number
}

export interface LimitedColorMatchGroup {
  /** Retained matches grouped by resolved color. */
  readonly groups: ColorMatchGroup

  /** Number of retained matches across all groups. */
  readonly matchCount: number

  /** Whether one or more input matches were omitted. */
  readonly truncated: boolean
}

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
 * Group color matches while bounding the decoration work retained by callers.
 * Existing color groups continue to receive matches after the color limit is
 * reached, up to the total match limit.
 *
 * @param matches - Color matches in detector order
 * @param limits - Maximum retained colors and matches
 * @returns Bounded groups plus truncation metadata
 */
export function groupColorMatchesWithinLimits(
  matches: readonly ColorMatch[],
  limits: ColorMatchGroupLimits,
): LimitedColorMatchGroup {
  const groups: ColorMatchGroup = {}
  let colorCount = 0
  let matchCount = 0
  let truncated = false

  for (const match of matches) {
    if (matchCount >= limits.maxMatchCount) {
      truncated = true
      break
    }

    const group = groups[match.color]
    if (group) {
      group.push(match)
      matchCount++
      continue
    }

    if (colorCount >= limits.maxColorCount) {
      truncated = true
      continue
    }

    groups[match.color] = [match]
    colorCount++
    matchCount++
  }

  return { groups, matchCount, truncated }
}
