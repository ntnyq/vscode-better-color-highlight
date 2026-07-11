import { getColorPresentations } from '../utils/color/presentation'
import type { ColorPresentations } from '../utils/color/presentation'
import type { WorkspaceColorOccurrence, WorkspacePaletteResult } from './types'

type WorkspaceScanStats = Omit<WorkspacePaletteResult, 'groups'>

const MAX_COLOR_GROUP_COUNT = 1024

interface MutableWorkspaceColorGroup {
  readonly color: string
  readonly occurrences: WorkspaceColorOccurrence[]
  readonly presentations: ColorPresentations
}

export function groupWorkspaceColorOccurrences(
  occurrences: readonly WorkspaceColorOccurrence[],
  stats: WorkspaceScanStats,
): WorkspacePaletteResult {
  const groups = new Map<string, MutableWorkspaceColorGroup>()
  const seenOccurrences = new Set<string>()
  let occurrenceTruncated = stats.occurrenceTruncated

  for (const occurrence of occurrences) {
    const presentations = getColorPresentations(occurrence.color)
    if (!presentations) {
      continue
    }

    const occurrenceKey = `${occurrence.uri}:${occurrence.start}:${occurrence.end}:${occurrence.color}`
    if (seenOccurrences.has(occurrenceKey)) {
      continue
    }
    seenOccurrences.add(occurrenceKey)

    const group = groups.get(occurrence.color)
    if (group) {
      group.occurrences.push(occurrence)
    } else if (groups.size >= MAX_COLOR_GROUP_COUNT) {
      occurrenceTruncated = true
    } else {
      groups.set(occurrence.color, {
        color: occurrence.color,
        occurrences: [occurrence],
        presentations,
      })
    }
  }

  for (const group of groups.values()) {
    group.occurrences.sort(compareOccurrences)
  }

  return {
    groups: [...groups.values()].sort(
      (left, right) =>
        right.occurrences.length - left.occurrences.length ||
        compareStrings(left.color, right.color),
    ),
    ...stats,
    occurrenceTruncated,
  }
}

function compareOccurrences(
  left: WorkspaceColorOccurrence,
  right: WorkspaceColorOccurrence,
): number {
  return compareStrings(left.uri, right.uri) || left.start - right.start
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}
