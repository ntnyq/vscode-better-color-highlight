import { describe, expect, it } from 'vitest'
import { findHslNoFunction } from '../../../src/engine/strategies/hsl-no-fn'

describe(findHslNoFunction, () => {
  it.each([
    'hypot(30, 40%, 50% )',
    'hsl(atan2(30 40% 50% ) 100% 50%)',
    'sqrt((30 40% 50% ))',
  ])('does not interpret CSS math operands as a bare color: %s', source => {
    expect(findHslNoFunction(source)).toStrictEqual([])
  })

  it('finds bare HSL triplets with commas', () => {
    const result = findHslNoFunction('color: 0, 100%, 50%;')
    expect(result).toHaveLength(1)
  })

  it('recovers genuine bare colors after invalid or unclosed math', () => {
    const prefix = 'hypot(30, 40%, 50% ); sqrt((30 40% 50% ; color: '
    const source = `${prefix}0 100% 50%;`
    expect(findHslNoFunction(source)).toStrictEqual([
      {
        start: prefix.length,
        end: prefix.length + 10,
        color: 'rgb(255, 0, 0)',
      },
    ])
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
