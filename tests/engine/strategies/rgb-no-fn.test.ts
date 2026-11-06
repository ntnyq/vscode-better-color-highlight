import { describe, expect, it } from 'vitest'
import { findRgbNoFunction } from '../../../src/engine/strategies/rgb-no-fn'

describe(findRgbNoFunction, () => {
  it.each([
    'hypot(3, 4, 5 )',
    'rgb(hypot(3, 4, 5 ) 0 0)',
    'rgb(pow(3, 4, 5 ) 0 0)',
    'sqrt((3 4 5 ))',
  ])('does not interpret CSS math operands as a bare color: %s', source => {
    expect(findRgbNoFunction(source)).toStrictEqual([])
  })

  it('finds bare RGB triplets with commas', () => {
    const result = findRgbNoFunction('color: 255, 0, 0;')
    expect(result).toHaveLength(1)
  })

  it('recovers genuine bare colors after invalid or unclosed math', () => {
    const prefix = 'hypot(3, 4, 5 ); sqrt((3 4 5 ; color: '
    const source = `${prefix}128 64 32;`
    expect(findRgbNoFunction(source)).toStrictEqual([
      {
        start: prefix.length,
        end: prefix.length + 9,
        color: 'rgb(128, 64, 32)',
      },
    ])
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
