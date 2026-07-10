import { describe, expect, it } from 'vitest'
import type { ColorMatch } from '../src/types'
import { groupByColor } from '../src/utils/color-match'

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
})
