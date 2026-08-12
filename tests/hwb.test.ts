import { describe, expect, it } from 'vitest'
import { findHwb } from '../src/engine/strategies/hwb'

describe(findHwb, () => {
  it('finds hwb() with space syntax', () => {
    const result = findHwb('color: hwb(0 0% 0%);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('finds hwb() with alpha', () => {
    const result = findHwb('color: hwb(0 0% 0% / 0.5);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toContain('rgba')
  })

  it('finds hwb() with degree units', () => {
    const result = findHwb('color: hwb(0deg 0% 0%);')
    expect(result).toHaveLength(1)
  })

  it('ignores hwb() inside a larger identifier', () => {
    expect(findHwb('myhwb(0 0% 0%)')).toStrictEqual([])
  })

  it('finds hwb() with decimal percentages in space syntax', () => {
    const result = findHwb('color: hwb(120.5 40.25% 10.75% / 50%);')
    expect(result).toHaveLength(1)
  })

  it('clamps hwb() percentages above 100 instead of rejecting the color', () => {
    const result = findHwb('color: hwb(0 100.1% 0%);')
    expect(result[0].color).toBe('rgb(255, 255, 255)')
  })
})
