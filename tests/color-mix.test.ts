import { describe, expect, it } from 'vitest'
import { findColorFunctions } from '../src/engine/strategies/color-functions'

describe('static color-mix()', () => {
  it.each([
    ['color-mix(in srgb, red, blue)', 'rgb(128, 0, 128)'],
    ['color-mix(in srgb, #ff0000 20%, #0000ff)', 'rgb(51, 0, 204)'],
    ['color-mix(in srgb, red 30%, blue 30%)', 'rgba(128, 0, 128, 0.6)'],
    [
      'color-mix(in srgb, rgb(100% 0% 0% / 0.7) 20%, rgb(0% 100% 0% / 0.2) 60%)',
      'rgba(137, 118, 0, 0.26)',
    ],
  ])('resolves %s', (source, expected) => {
    expect(findColorFunctions(source)).toStrictEqual([
      {
        start: 0,
        end: source.length,
        color: expected,
      },
    ])
  })

  it('supports default Oklab interpolation and polar hue methods', () => {
    expect(findColorFunctions('color-mix(red, blue)')).toHaveLength(1)

    const shorter = findColorFunctions(
      'color-mix(in oklch shorter hue, oklch(0.6 0.2 30), oklch(0.6 0.2 90))',
    )[0]
    const longer = findColorFunctions(
      'color-mix(in oklch longer hue, oklch(0.6 0.2 30), oklch(0.6 0.2 90))',
    )[0]

    expect(shorter.color).not.toBe(longer.color)
  })

  it.each([
    'srgb',
    'srgb-linear',
    'display-p3',
    'display-p3-linear',
    'a98-rgb',
    'prophoto-rgb',
    'rec2020',
    'xyz',
    'xyz-d50',
    'xyz-d65',
    'lab',
    'lch',
    'oklab',
    'oklch',
    'hsl',
    'hwb',
  ])('supports the %s interpolation space', space => {
    expect(
      findColorFunctions(`color-mix(in ${space}, red, blue)`),
    ).toHaveLength(1)
  })

  it('carries missing components before interpolation', () => {
    const source = 'color-mix(in srgb, rgb(none 0 0), rgb(100% 100% 100%))'

    expect(findColorFunctions(source)).toStrictEqual([
      {
        start: 0,
        end: source.length,
        color: 'rgb(255, 128, 128)',
      },
    ])
  })

  it('matches the CSS Color specification LCH percentage example', () => {
    expect(
      findColorFunctions('color-mix(in lch, purple 50%, plum 50%)')[0].color,
    ).toBe('rgb(175, 92, 174)')
  })

  it('resolves more than two static color items in source order', () => {
    const source = 'color-mix(in srgb, red, lime, blue)'

    expect(findColorFunctions(source)).toStrictEqual([
      {
        start: 0,
        end: source.length,
        color: 'rgb(85, 85, 85)',
      },
    ])
  })

  it('scans balanced nested functions and owns the complete range', () => {
    const source =
      'color-mix(in srgb, rgb(255 0 0 / 50%), color(display-p3 0 0 1))'

    expect(findColorFunctions(source)).toStrictEqual([
      {
        start: 0,
        end: source.length,
        color: 'rgba(85, 0, 177, 0.75)',
      },
    ])
  })

  it.each([
    'color-mix(in srgb, red -10%, blue)',
    'color-mix(in srgb shorter hue, red, blue)',
    'color-mix(in oklch sideways hue, red, blue)',
    'color-mix(in srgb, var(--brand), blue)',
  ])('rejects non-static or invalid expressions %s', source => {
    expect(findColorFunctions(source)).toStrictEqual([])
  })
})
