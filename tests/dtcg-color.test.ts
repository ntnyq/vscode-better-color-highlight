import { describe, expect, it } from 'vitest'
import { resolveDtcgColor } from '../src/strategies/design-tokens/color'

describe(resolveDtcgColor, () => {
  it.each([
    ['srgb', [1, 0, 0], 'rgb(255, 0, 0)'],
    ['srgb-linear', [1, 0, 0], 'rgb(255, 0, 0)'],
    ['hsl', [0, 1, 0.5], 'rgb(255, 0, 0)'],
    ['hwb', [0, 0, 0], 'rgb(255, 0, 0)'],
    ['lab', [50, 0, 0], 'rgb(119, 119, 119)'],
    ['lch', [50, 0, 0], 'rgb(119, 119, 119)'],
    ['oklab', [0.5, 0, 0], 'rgb(99, 99, 99)'],
    ['oklch', [0.5, 0, 0], 'rgb(99, 99, 99)'],
    ['display-p3', [0, 0, 0], 'rgb(0, 0, 0)'],
    ['a98-rgb', [0, 0, 0], 'rgb(0, 0, 0)'],
    ['prophoto-rgb', [0, 0, 0], 'rgb(0, 0, 0)'],
    ['rec2020', [0, 0, 0], 'rgb(0, 0, 0)'],
    ['xyz-d65', [0, 0, 0], 'rgb(0, 0, 0)'],
    ['xyz-d50', [0, 0, 0], 'rgb(0, 0, 0)'],
  ])(
    'converts %s structured components',
    (colorSpace, components, expected) => {
      expect(resolveDtcgColor({ colorSpace, components })).toBe(expected)
    },
  )

  it('preserves structured alpha', () => {
    expect(
      resolveDtcgColor({
        colorSpace: 'srgb',
        components: [1, 0, 0],
        alpha: 0.5,
      }),
    ).toBe('rgba(255, 0, 0, 0.5)')
  })

  it.each([
    { colorSpace: 'srgb', components: [1.1, 0, 0] },
    { colorSpace: 'hsl', components: [360, 100, 50] },
    { colorSpace: 'hsl', components: [0, 1.1, 0.5] },
    { colorSpace: 'hwb', components: [0, -1, 0] },
    { colorSpace: 'hwb', components: [0, 0, 1.1] },
    { colorSpace: 'lab', components: [101, 0, 0] },
    { colorSpace: 'oklab', components: [1.1, 0, 0] },
    { colorSpace: 'srgb', components: [1, 0, 0], alpha: 1.1 },
    { colorSpace: 'unknown', components: [1, 0, 0] },
    { colorSpace: 'srgb', components: [1, 0] },
    { colorSpace: 'srgb', components: [1, Number.NaN, 0] },
    null,
  ])('rejects invalid structured colors %#', value => {
    expect(resolveDtcgColor(value)).toBeNull()
  })

  it('allows finite unbounded Lab channels', () => {
    expect(
      resolveDtcgColor({ colorSpace: 'lab', components: [50, 200, -200] }),
    ).not.toBeNull()
  })

  it('uses a six-digit fallback for none components and keeps alpha', () => {
    expect(
      resolveDtcgColor({
        colorSpace: 'hsl',
        components: ['none', 0, 1],
        alpha: 0.5,
        hex: '#00ff00',
      }),
    ).toBe('rgba(0, 255, 0, 0.5)')
  })

  it('rejects none without a valid six-digit fallback', () => {
    expect(
      resolveDtcgColor({
        colorSpace: 'hsl',
        components: ['none', 0, 1],
      }),
    ).toBeNull()
    expect(
      resolveDtcgColor({
        colorSpace: 'hsl',
        components: ['none', 0, 1],
        hex: '#0f0',
      }),
    ).toBeNull()
    expect(
      resolveDtcgColor({
        colorSpace: 'unknown',
        components: ['none', 0, 1],
        hex: '#00ff00',
      }),
    ).toBeNull()
    expect(
      resolveDtcgColor({
        colorSpace: 'hsl',
        components: ['none', 2, 1],
        hex: '#00ff00',
      }),
    ).toBeNull()
  })

  it.each(['lab', 'lch', 'oklab', 'oklch'])(
    'rejects non-finite %s channels even when none has a fallback',
    colorSpace => {
      for (const invalid of [Infinity, -Infinity, Number.NaN]) {
        expect(
          resolveDtcgColor({
            colorSpace,
            components: ['none', invalid, 0],
            hex: '#00ff00',
          }),
        ).toBeNull()
      }
    },
  )

  it('ignores fallback hex when all structured components are present', () => {
    expect(
      resolveDtcgColor({
        colorSpace: 'srgb',
        components: [1, 0, 0],
        hex: '#00ff00',
      }),
    ).toBe('rgb(255, 0, 0)')
  })
})
