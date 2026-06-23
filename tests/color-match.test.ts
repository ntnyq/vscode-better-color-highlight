import { describe, expect, it } from 'vitest'
import type { ColorMatch } from '../src/types'
import { groupByColor, mergeMatches } from '../src/utils/color-match'

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

describe(mergeMatches, () => {
  it('merges multiple arrays', () => {
    const a: ColorMatch[] = [{ start: 0, end: 7, color: 'rgb(255, 0, 0)' }]
    const b: ColorMatch[] = [{ start: 10, end: 17, color: 'rgb(0, 0, 255)' }]

    const result = mergeMatches(a, b)
    expect(result).toHaveLength(2)
  })

  it('removes exact duplicates (earlier arrays take priority)', () => {
    const a: ColorMatch[] = [{ start: 0, end: 7, color: 'rgb(255, 0, 0)' }]
    const b: ColorMatch[] = [{ start: 0, end: 7, color: 'rgb(255, 0, 0)' }]

    const result = mergeMatches(a, b)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('keeps matches that share start but differ in end or color', () => {
    const a: ColorMatch[] = [{ start: 0, end: 7, color: 'rgb(255, 0, 0)' }]
    const b: ColorMatch[] = [
      { start: 0, end: 9, color: 'rgb(255, 0, 0)' },
      { start: 0, end: 7, color: 'rgb(0, 0, 255)' },
    ]

    const result = mergeMatches(a, b)
    expect(result).toHaveLength(3)
  })
})
