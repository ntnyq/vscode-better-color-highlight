import { describe, expect, it } from 'vitest'
import type { ColorMatch } from '../src/types'
import {
  groupByColor,
  groupColorMatchesWithinLimits,
} from '../src/utils/color-match'

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
