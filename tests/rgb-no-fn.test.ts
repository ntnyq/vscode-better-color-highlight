import { describe, expect, it } from 'vitest'
import { findRgbNoFunction } from '../src/strategies/rgb-no-fn'

describe(findRgbNoFunction, () => {
  it('finds bare RGB triplets with commas', () => {
    const result = findRgbNoFunction('color: 255, 0, 0;')
    expect(result).toHaveLength(1)
  })

  it('finds bare RGB triplets with spaces', () => {
    const result = findRgbNoFunction('color: 255 0 0;')
    expect(result).toHaveLength(1)
  })

  it('rejects out-of-range values', () => {
    const result = findRgbNoFunction('color: 300, 0, 0;')
    expect(result).toHaveLength(0)
  })
})
