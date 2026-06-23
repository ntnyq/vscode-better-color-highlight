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

  it('finds bare RGB triplets before an XML closing tag', () => {
    const result = findRgbNoFunction('<color>123, 234, 12</color>')
    expect(result).toStrictEqual([
      { start: 7, end: 19, color: 'rgb(123, 234, 12)' },
    ])
  })
})
