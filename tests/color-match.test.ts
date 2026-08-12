import { describe, expect, it } from 'vitest'
import type { ColorMatch } from '../src/engine/detection'
import {
  arbitrateColorMatches,
  groupByColor,
  groupColorMatchesWithinLimits,
} from '../src/engine/detection/color-match'

describe(arbitrateColorMatches, () => {
  it('prefers one complete semantic expression over nested literal matches', () => {
    const matches: ColorMatch[] = [
      { start: 14, end: 21, color: 'rgb(255, 0, 0)' },
      {
        start: 7,
        end: 36,
        color: 'rgb(140, 83, 162)',
      },
      { start: 27, end: 34, color: 'rgb(0, 0, 255)' },
    ]

    expect(arbitrateColorMatches(matches)).toStrictEqual([matches[1]])
  })

  it('deduplicates exact ranges and retains non-containing overlaps', () => {
    const first = { start: 0, end: 7, color: 'rgb(255, 0, 0)' }
    const crossing = { start: 5, end: 12, color: 'rgb(0, 0, 255)' }

    expect(
      arbitrateColorMatches([first, { ...first }, crossing]),
    ).toStrictEqual([first, crossing])
  })
})

describe(groupByColor, () => {
  it('groups matches by color', () => {
    const matches: ColorMatch[] = [
      { start: 0, end: 7, color: 'rgb(255, 0, 0)' },
      { start: 10, end: 17, color: 'rgb(0, 0, 255)' },
      { start: 20, end: 27, color: 'rgb(255, 0, 0)' },
    ]

    const groups = groupByColor(matches)
    expect(Object.keys(groups)).toHaveLength(2)
    expect(groups['rgb(255, 0, 0)']).toHaveLength(2)
    expect(groups['rgb(0, 0, 255)']).toHaveLength(1)
  })

  it('returns empty object for empty array', () => {
    expect(groupByColor([])).toStrictEqual({})
  })

  it('bounds retained matches and unique color groups', () => {
    const matches: ColorMatch[] = [
      { start: 0, end: 1, color: 'red' },
      { start: 1, end: 2, color: 'blue' },
      { start: 2, end: 3, color: 'green' },
      { start: 3, end: 4, color: 'red' },
      { start: 4, end: 5, color: 'blue' },
    ]

    expect(
      groupColorMatchesWithinLimits(matches, {
        maxColorCount: 2,
        maxMatchCount: 3,
      }),
    ).toStrictEqual({
      groups: {
        blue: [{ start: 1, end: 2, color: 'blue' }],
        red: [
          { start: 0, end: 1, color: 'red' },
          { start: 3, end: 4, color: 'red' },
        ],
      },
      matchCount: 3,
      truncated: true,
    })
  })
})
