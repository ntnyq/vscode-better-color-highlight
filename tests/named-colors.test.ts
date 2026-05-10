import { describe, expect, it } from 'vitest'
import { findNamedColors } from '../src/strategies/named-colors'

describe(findNamedColors, () => {
  it('finds named color "red"', () => {
    const result = findNamedColors('color: red;')
    expect(result).toStrictEqual([
      { start: 7, end: 10, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('finds a named color at the start of the string', () => {
    const result = findNamedColors('red')
    expect(result).toStrictEqual([
      { start: 0, end: 3, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('finds named color "rebeccapurple"', () => {
    const result = findNamedColors('color: rebeccapurple;')
    expect(result).toStrictEqual([
      { start: 7, end: 20, color: 'rgb(102, 51, 153)' },
    ])
  })

  it('skips colors preceded by $ (SCSS variable)', () => {
    const result = findNamedColors('$red: #ff0000;')
    expect(result).toStrictEqual([])
  })

  it('skips colors preceded by @ (Less variable)', () => {
    const result = findNamedColors('@red: #ff0000;')
    expect(result).toStrictEqual([])
  })

  it('skips colors preceded by - (hyphenated)', () => {
    const result = findNamedColors('dark-red')
    expect(result).toStrictEqual([])
  })

  it('finds multiple named colors', () => {
    const result = findNamedColors('color: red; bg: blue;')
    expect(result).toHaveLength(2)
  })
})
