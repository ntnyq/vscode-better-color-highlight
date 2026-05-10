import { describe, expect, it } from 'vitest'
import { findHexRGBA, findHexARGB } from '../src/strategies/hex'

describe(findHexRGBA, () => {
  it('finds 6-digit hex colors', () => {
    const result = findHexRGBA('color: #ff0000;')
    expect(result).toStrictEqual([
      { start: 7, end: 14, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('finds 3-digit hex colors', () => {
    const result = findHexRGBA('color: #f00;')
    expect(result).toStrictEqual([
      { start: 7, end: 11, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('finds 8-digit hex colors with alpha (RGBA)', () => {
    const result = findHexRGBA('color: #ff000080;')
    expect(result).toHaveLength(1)
    expect(result[0].color).toContain('rgba')
  })

  it('skips hex preceded by word character', () => {
    const result = findHexRGBA('font0xff0000')
    expect(result).toStrictEqual([])
  })

  it('finds multiple hex colors', () => {
    const result = findHexRGBA('color: #ff0000; bg: #0000ff;')
    expect(result).toHaveLength(2)
  })
})

describe(findHexARGB, () => {
  it('parses 8-digit hex as ARGB', () => {
    const result = findHexARGB('color: #80ff0000;')
    expect(result).toHaveLength(1)
    expect(result[0].color).toContain('rgba')
  })

  it('parses 6-digit hex normally (no alpha to swap)', () => {
    const result = findHexARGB('color: #ff0000;')
    expect(result).toStrictEqual([
      { start: 7, end: 14, color: 'rgb(255, 0, 0)' },
    ])
  })
})
