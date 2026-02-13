import { describe, expect, it } from 'vitest'
import { findColorFunctions } from '../src/strategies/color-functions'

describe(findColorFunctions, () => {
  it('finds rgb() function', () => {
    const result = findColorFunctions('color: rgb(255, 0, 0);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('finds rgba() function', () => {
    const result = findColorFunctions('color: rgba(255, 0, 0, 0.5);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toContain('rgba')
  })

  it('finds hsl() function', () => {
    const result = findColorFunctions('color: hsl(0, 100%, 50%);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('finds hsla() function', () => {
    const result = findColorFunctions('color: hsla(0, 100%, 50%, 0.5);')
    expect(result).toHaveLength(1)
  })

  it('finds space-delimited hsl()', () => {
    const result = findColorFunctions('color: hsl(0 100% 50%);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('finds lch() function', () => {
    const result = findColorFunctions('color: lch(50 30 0);')
    expect(result).toHaveLength(1)
  })

  it('finds oklch() function', () => {
    const result = findColorFunctions('color: oklch(0.5 0.1 0);')
    expect(result).toHaveLength(1)
  })

  it('finds lab() function', () => {
    const result = findColorFunctions('color: lab(50 0 0);')
    expect(result).toHaveLength(1)
  })

  it('finds oklab() function', () => {
    const result = findColorFunctions('color: oklab(0.5 0 0);')
    expect(result).toHaveLength(1)
  })

  it('finds CSS variable shorthand', () => {
    const result = findColorFunctions('--color-rgb: 255 0 0;')
    expect(result).toHaveLength(1)
  })
})
