import { describe, expect, it } from 'vitest'
import { findColorFunctions } from '../src/engine/strategies/color-functions'
import { findHwb } from '../src/engine/strategies/hwb'

describe('css color 4 syntax', () => {
  it.each([
    ['rgb(none 255 none / none)', 'rgba(0, 255, 0, 0)'],
    ['hsl(none none 50% / none)', 'rgba(128, 128, 128, 0)'],
    ['lab(none none none / none)', 'rgba(0, 0, 0, 0)'],
    ['lch(none none none / none)', 'rgba(0, 0, 0, 0)'],
    ['oklab(none none none / none)', 'rgba(0, 0, 0, 0)'],
    ['oklch(none none none / none)', 'rgba(0, 0, 0, 0)'],
    ['color(srgb none 1 none / none)', 'rgba(0, 255, 0, 0)'],
  ])('resolves missing components in %s', (source, expected) => {
    expect(findColorFunctions(source)).toStrictEqual([
      {
        start: 0,
        end: source.length,
        color: expected,
      },
    ])
  })

  it('supports the display-p3-linear predefined color space', () => {
    const source = 'color(display-p3-linear 1 0 0 / 50%)'

    expect(findColorFunctions(source)).toStrictEqual([
      {
        start: 0,
        end: source.length,
        color: 'rgba(255, 0, 0, 0.5)',
      },
    ])
  })

  it('converts equivalent encoded and linear Display P3 colors alike', () => {
    const encoded = findColorFunctions('color(display-p3 0.591 0.123 0.264)')
    const linear = findColorFunctions(
      'color(display-p3-linear 0.3081 0.014 0.0567)',
    )

    expect(encoded[0].color).toBe(linear[0].color)
  })

  it('allows function whitespace while restricting color() spaces', () => {
    expect(findColorFunctions('color( display-p3 1 0 0 )')).toHaveLength(1)
    expect(findColorFunctions('color(lab 50 0 0)')).toStrictEqual([])
    expect(findColorFunctions('rgb(0 0 0 / )')).toStrictEqual([])
  })

  it.each([
    'lab(50, 0, 0)',
    'lch(50, 20, 30)',
    'oklab(0.5, 0, 0)',
    'oklch(0.5, 0.1, 30)',
    'laba(50 0 0 / 0.5)',
    'lcha(50 20 30 / 0.5)',
    'oklaba(0.5 0 0 / 0.5)',
    'oklcha(0.5 0.1 30 / 0.5)',
    'rgb(none, 0, 0)',
    'rgb(255, 0, 0 / 50%)',
  ])('rejects non-standard syntax %s', source => {
    expect(findColorFunctions(source)).toStrictEqual([])
  })

  it('accepts modern hwb syntax with missing components', () => {
    const source = 'hwb(none none none / none)'

    expect(findHwb(source)).toStrictEqual([
      {
        start: 0,
        end: source.length,
        color: 'rgba(0, 0, 0, 0)',
      },
    ])
  })

  it('accepts modern number channels for HSL and HWB', () => {
    expect(findColorFunctions('hsl(0 100 50)')[0].color).toBe('rgb(255, 0, 0)')
    expect(findHwb('hwb(0 0 0)')[0].color).toBe('rgb(255, 0, 0)')
  })

  it('keeps alpha optional for both legacy function aliases', () => {
    expect(findColorFunctions('rgb(255, 0, 0, 0.5)')).toHaveLength(1)
    expect(findColorFunctions('rgba(255, 0, 0)')).toHaveLength(1)
    expect(findColorFunctions('hsl(0, 100%, 50%, 0.5)')).toHaveLength(1)
    expect(findColorFunctions('hsla(0, 100%, 50%)')).toHaveLength(1)
  })

  it.each(['hwb(0, 0%, 0%)', 'hwb(0 0% 0%, 0.5)'])(
    'rejects legacy hwb syntax %s',
    source => {
      expect(findHwb(source)).toStrictEqual([])
    },
  )
})
