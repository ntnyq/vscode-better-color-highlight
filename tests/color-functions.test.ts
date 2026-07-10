import { describe, expect, it } from 'vitest'
import { findColorFunctions } from '../src/strategies/color-functions'

describe(findColorFunctions, () => {
  it('finds rgb() function', () => {
    const result = findColorFunctions('color: rgb(255, 0, 0);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('preserves low numeric rgb() channels as 0-255 values', () => {
    const result = findColorFunctions('color: rgb(1, 1, 1);')

    expect(result).toStrictEqual([
      {
        start: 7,
        end: 19,
        color: 'rgb(1, 1, 1)',
      },
    ])
  })

  it('scales percentage rgb() channels to 0-255 values', () => {
    const result = findColorFunctions('color: rgb(1%, 1%, 1%);')

    expect(result).toStrictEqual([
      {
        start: 7,
        end: 22,
        color: 'rgb(3, 3, 3)',
      },
    ])
  })

  it('finds rgba() function', () => {
    const result = findColorFunctions('color: rgba(255, 0, 0, 0.5);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toContain('rgba')
  })

  it('finds Hyprland rgba() hex colors', () => {
    const result = findColorFunctions('col.active_border = rgba(33ccffee)')

    expect(result).toStrictEqual([
      {
        start: 20,
        end: 34,
        color: 'rgba(51, 204, 255, 0.933)',
      },
    ])
  })

  it('ignores short Hyprland rgba() hex colors', () => {
    const result = findColorFunctions('col.active_border = rgba(f0ae)')

    expect(result).toHaveLength(0)
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

  it('uses CSS percentage reference ranges for lch() channels', () => {
    const percentages = findColorFunctions('lch(50% 20% 30)')
    const numbers = findColorFunctions('lch(50 30 30)')

    expect(percentages[0].color).toBe(numbers[0].color)
  })

  it('finds oklch() function', () => {
    const result = findColorFunctions('color: oklch(0.5 0.1 0);')
    expect(result).toHaveLength(1)
  })

  it('finds lab() function', () => {
    const result = findColorFunctions('color: lab(50 0 0);')
    expect(result).toHaveLength(1)
  })

  it('uses CSS percentage reference ranges for lab() channels', () => {
    const percentages = findColorFunctions('lab(50% 20% -20%)')
    const numbers = findColorFunctions('lab(50 25 -25)')

    expect(percentages[0].color).toBe(numbers[0].color)
  })

  it('finds oklab() function', () => {
    const result = findColorFunctions('color: oklab(0.5 0 0);')
    expect(result).toHaveLength(1)
  })

  it('finds CSS variable shorthand', () => {
    const result = findColorFunctions('--color-rgb: 255 0 0;')
    expect(result).toHaveLength(1)
  })

  it('preserves low numeric RGB shorthand channels as 0-255 values', () => {
    const result = findColorFunctions('--color-rgb: 1 1 1;')

    expect(result).toStrictEqual([
      {
        start: 0,
        end: 19,
        color: 'rgb(1, 1, 1)',
      },
    ])
  })

  it('finds CSS variable shorthand with signed lab channels', () => {
    const result = findColorFunctions('--token-lab: 70 +20 -30;')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(187, 160, 226)')
  })

  it('finds CSS variable shorthand with signed oklab channels', () => {
    const result = findColorFunctions('--token-oklab: 0.7 +0.1 -0.05;')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(200, 131, 188)')
  })

  it('finds color() in display-p3 space', () => {
    const result = findColorFunctions('color: color(display-p3 1 0 0);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('finds color() with alpha channel', () => {
    const result = findColorFunctions('color: color(srgb 1 0 0 / 0.5);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgba(255, 0, 0, 0.5)')
  })

  it('preserves slash alpha in space-delimited rgb()', () => {
    const result = findColorFunctions('color: rgb(42 42 42 / 0.42);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgba(42, 42, 42, 0.42)')
  })

  it('preserves slash alpha in space-delimited hsl()', () => {
    const result = findColorFunctions('color: hsl(0 100% 50% / 42%);')
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgba(255, 0, 0, 0.42)')
  })

  it('skips malformed numeric channels', () => {
    const result = findColorFunctions('color: rgb(1*2, 0, 0);')

    expect(result).toStrictEqual([])
  })
})
