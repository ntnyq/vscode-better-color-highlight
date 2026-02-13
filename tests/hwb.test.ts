import { describe, expect, it } from 'vitest'
import { findHwb } from '../src/strategies/hwb'

describe(findHwb, () => {
  it('finds hwb() with comma syntax', () => {
    const result = findHwb('color: hwb(0, 0%, 0%);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('finds hwb() with space syntax', () => {
    const result = findHwb('color: hwb(0 0% 0%);')
    expect(result).toHaveLength(1)
  })

  it('finds hwb() with alpha', () => {
    const result = findHwb('color: hwb(0, 0%, 0%, 0.5);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toContain('rgba')
  })

  it('finds hwb() with degree units', () => {
    const result = findHwb('color: hwb(0deg, 0%, 0%);')
    expect(result).toHaveLength(1)
  })
})
