import { describe, expect, it } from 'vitest'
import { findHslNoFunction } from '../src/strategies/hsl-no-fn'

describe(findHslNoFunction, () => {
  it('finds bare HSL triplets with commas', () => {
    const result = findHslNoFunction('color: 0, 100%, 50%;')
    expect(result).toHaveLength(1)
  })

  it('finds bare HSL triplets with spaces', () => {
    const result = findHslNoFunction('color: 0 100% 50%;')
    expect(result).toHaveLength(1)
  })

  it('rejects invalid percentage values', () => {
    const result = findHslNoFunction('color: 0, 150%, 50%;')
    expect(result).toHaveLength(0)
  })
})
