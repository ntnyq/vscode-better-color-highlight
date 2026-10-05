import { describe, expect, it } from 'vitest'
import { findColorFunctions } from '../../../../src/engine/strategies/color-functions'
import {
  formatCssColor,
  parseCssColorExpression,
} from '../../../../src/engine/strategies/css-color/parser'
import {
  convertCssColor,
  createCssColor,
} from '../../../../src/engine/strategies/css-color/space'

describe('static absolute CSS color calculations', () => {
  it.each([
    {
      source:
        'rgb(calc(255 / 2) min(100%, 20%) clamp(0, 300, 255) / max(.25, .5))',
      space: 'srgb',
      channels: [0.5, 0.2, 1],
    },
    {
      source:
        'RGBA(CALC(50% * 2) MIN(0, 10) MAX(0%, -1%) / CLAMP(NONE, 50%, NONE))',
      space: 'srgb',
      channels: [1, 0, 0],
    },
    {
      source:
        'hsl(calc(.5turn + 100grad) min(80%, 50%) max(25, 50) / calc(1 / 2))',
      space: 'hsl',
      channels: [270, 0.5, 0.5],
    },
    {
      source:
        'hsla(min(120, 240) max(50, 100) clamp(0%, 50%, 100%) / calc(50%))',
      space: 'hsl',
      channels: [120, 1, 0.5],
    },
    {
      source:
        'hwb(max(90deg, .5turn) min(20, 40) calc(10% + 20%) / min(50%, 75%))',
      space: 'hwb',
      channels: [180, 0.2, 0.3],
    },
    {
      source: 'lab(calc(25% * 2) min(20%, 40%) max(-40%, -60%) / max(.25, .5))',
      space: 'lab',
      channels: [50, 25, -50],
    },
    {
      source:
        'lch(clamp(0%, 50%, 100%) calc(20% / 2) min(100grad, .5turn) / calc(.5))',
      space: 'lch',
      channels: [50, 15, 90],
    },
    {
      source: 'oklab(calc(25% * 2) min(25%, 50%) max(-50%, -75%) / calc(50%))',
      space: 'oklab',
      channels: [0.5, 0.1, -0.2],
    },
    {
      source:
        'oklch(max(.25, .5) clamp(0%, 25%, 50%) calc(1turn - 270deg) / min(.5))',
      space: 'oklch',
      channels: [0.5, 0.1, 90],
    },
  ])(
    'uses the channel reference ranges in $source',
    ({ source, space, channels }) => {
      expect(parseCssColorExpression(source)).toStrictEqual({
        space,
        channels,
        alpha: 0.5,
        missing: [false, false, false, false],
      })
    },
  )

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
  ])('retains calculated out-of-gamut channels in color(%s)', space => {
    const source = `color(${space} calc(50% / 2) min(-.5, 0) max(120%, 100%) / clamp(0, .5, 1))`
    expect(parseCssColorExpression(source)).toStrictEqual({
      space: space === 'xyz' ? 'xyz-d65' : space,
      channels: [0.25, -0.5, 1.2],
      alpha: 0.5,
      missing: [false, false, false, false],
    })
  })

  it.each([
    ['rgb(calc(255), min(20, 10), max(0, -1))', 'rgb(255, 10, 0)'],
    [
      'rgba(calc(255 / 2), min(20, 10), max(0, -1), calc(1 / 2))',
      'rgba(128, 10, 0, 0.5)',
    ],
    [
      'rgb(calc(100%), min(20%, 10%), max(0%, -1%), max(.25, .5))',
      'rgba(255, 26, 0, 0.5)',
    ],
    ['rgba(calc(100%), 0%, 0%, clamp(0%, 50%, 100%))', 'rgba(255, 0, 0, 0.5)'],
    [
      'hsl(calc(90deg + 100grad), min(100%, 100%), max(25%, 50%))',
      'rgb(0, 255, 255)',
    ],
    [
      'hsla(min(.5turn, 300deg), calc(50% * 2), clamp(0%, 50%, 100%), calc(50% / 2))',
      'rgba(0, 255, 255, 0.25)',
    ],
    [
      'hsl(calc(120), calc(100%), calc(50%), min(.75, 1))',
      'rgba(0, 255, 0, 0.75)',
    ],
    ['rgb(calc(min(255, 300) / 2 + max(10, 20)) 0 0)', 'rgb(148, 0, 0)'],
    ['rgb(clamp(200, min(300, 250), 100) 0 0)', 'rgb(200, 0, 0)'],
    [
      'rgb(calc((20 + 30) * 2) 0 0 / clamp(none, 50%, none))',
      'rgba(100, 0, 0, 0.5)',
    ],
    [
      'rgb(\nmin(255, 300)\tcalc(0 / 2)\fmax(0, -1) / calc(.5)\n)',
      'rgba(255, 0, 0, 0.5)',
    ],
  ])(
    'keeps nested separators inside each component of %s',
    (source, expected) => {
      const parsed = parseCssColorExpression(source)
      expect(parsed && formatCssColor(parsed)).toBe(expected)
      expect(findColorFunctions(source)).toStrictEqual([
        { start: 0, end: source.length, color: expected },
      ])
    },
  )

  it.each([
    'rgb(none calc(0) clamp(none, 0, none) / none)',
    'hsl(none calc(0%) clamp(none, 0%, none) / none)',
    'hwb(none calc(0) clamp(none, 0, none) / none)',
    'lab(none calc(0%) clamp(none, 0, none) / none)',
    'lch(none calc(0%) clamp(none, 0deg, none) / none)',
    'oklab(none calc(0) clamp(none, 0%, none) / none)',
    'oklch(none calc(0%) clamp(none, 0, none) / none)',
    'color(srgb none calc(0%) clamp(none, 0, none) / none)',
  ])('distinguishes missing components from calculated zero in %s', source => {
    expect(parseCssColorExpression(source)).toMatchObject({
      channels: [0, 0, 0],
      alpha: 0,
      missing: [true, false, false, true],
    })
  })

  it.each<[string, number[], number]>([
    ['rgb(calc(-255) max(300, 255) min(200%, 150%) / calc(2))', [0, 1, 1], 1],
    ['rgb(calc(-255), max(300, 255), min(512, 510), calc(-1))', [0, 1, 1], 0],
    [
      'hsl(calc(-90deg) min(-20%, -10%) calc(150%) / calc(-10%))',
      [270, 0, 1.5],
      0,
    ],
    ['hsl(calc(450), min(-20%, -10%), calc(50%), calc(150%))', [90, 0, 0.5], 1],
    ['hsl(calc(450) max(200%, 100%) calc(-25%))', [90, 2, -0.25], 1],
    ['hwb(calc(-90) max(200%, 100%) min(150, 100))', [270, 2, 1], 1],
    ['lab(calc(200%) min(-200%, -100%) max(200, 100))', [100, -250, 200], 1],
    ['lab(calc(-20) min(-200, -100) max(200%, 100%))', [0, -200, 250], 1],
    ['lch(calc(200%) calc(-10%) calc(-90deg))', [100, 0, 270], 1],
    ['lch(calc(-20%) calc(200%) calc(450))', [0, 300, 90], 1],
    ['oklab(calc(200%) calc(-200%) calc(200%))', [1, -0.8, 0.8], 1],
    ['oklab(calc(-1) calc(-2) calc(2))', [0, -2, 2], 1],
    ['oklch(calc(200%) calc(-10%) calc(-90deg))', [1, 0, 270], 1],
    ['oklch(calc(-1) calc(200%) calc(450))', [0, 0.8, 90], 1],
  ])('applies absolute parse-time ranges to %s', (source, channels, alpha) => {
    expect(parseCssColorExpression(source)).toMatchObject({
      channels,
      alpha,
    })
  })

  it('applies the same range rules to literal channels', () => {
    expect(parseCssColorExpression('rgb(-255 300 150% / 2)')).toMatchObject({
      channels: [0, 1, 1],
      alpha: 1,
    })
    expect(
      parseCssColorExpression('hsl(-90 -20% 150%)')?.channels,
    ).toStrictEqual([270, 0, 1.5])
    expect(
      parseCssColorExpression('lab(200% -200% 200%)')?.channels,
    ).toStrictEqual([100, -250, 250])
    expect(
      parseCssColorExpression('oklch(-1 -10% 450)')?.channels,
    ).toStrictEqual([0, 0, 90])
  })

  it('retains relative outputs outside the absolute RGB reference range', () => {
    expect(
      parseCssColorExpression('rgb(from red calc(r * 2) g b)'),
    ).toMatchObject({
      channels: [2, 0, 0],
    })
  })

  it.each([
    {
      saturation: 200,
      lightness: 25,
      channels: [-0.25, 0.75, -0.25],
      color: 'rgb(0, 191, 0)',
    },
    {
      saturation: 200,
      lightness: 150,
      channels: [2.5, 0.5, 2.5],
      color: 'rgb(255, 128, 255)',
    },
    {
      saturation: 200,
      lightness: -50,
      channels: [0.5, -1.5, 0.5],
      color: 'rgb(128, 0, 128)',
    },
    {
      saturation: -100,
      lightness: 25,
      channels: [0.25, 0.25, 0.25],
      color: 'rgb(64, 64, 64)',
    },
    {
      saturation: 100,
      lightness: 50,
      channels: [0, 1, 0],
      color: 'rgb(0, 255, 0)',
    },
  ])(
    'converts HSL saturation $saturation and lightness $lightness before clipping',
    ({ saturation, lightness, channels, color }) => {
      for (const source of [
        `hsl(120 ${saturation}% ${lightness}%)`,
        `hsl(calc(120) calc(${saturation}%) calc(${lightness}%))`,
        `hsla(calc(120), calc(${saturation}%), calc(${lightness}%))`,
      ]) {
        const parsed = parseCssColorExpression(source)
        expect(parsed).not.toBeNull()
        if (!parsed) {
          continue
        }
        const converted = convertCssColor(parsed, 'srgb')
        for (const [index, channel] of channels.entries()) {
          expect(converted.channels[index]).toBeCloseTo(channel, 12)
        }
        expect(formatCssColor(parsed)).toBe(color)
      }
    },
  )

  it('retains extended HSL conversion for relative sources and color mixing', () => {
    expect(
      parseCssColorExpression(
        'color(from hsl(120 calc(200%) calc(25%)) srgb r g b)',
      ),
    ).toMatchObject({ channels: [-0.25, 0.75, -0.25] })
    const mixed = parseCssColorExpression(
      'color-mix(in srgb, hsl(120 calc(200%) calc(25%)), white)',
    )
    expect(mixed?.channels).toStrictEqual([0.375, 0.875, 0.375])
    expect(mixed && formatCssColor(mixed)).toBe('rgb(96, 223, 96)')
  })

  it.each([
    [200, 100, 'rgb(170, 170, 170)'],
    [100, 200, 'rgb(85, 85, 85)'],
    [150, 50, 'rgb(191, 191, 191)'],
    [50, 150, 'rgb(64, 64, 64)'],
    [180, 120, 'rgb(153, 153, 153)'],
    [260, 260, 'rgb(128, 128, 128)'],
  ])(
    'preserves the HWB ratio for %s%% white and %s%% black',
    (white, black, expected) => {
      for (const source of [
        `hwb(0 ${white}% ${black}%)`,
        `hwb(calc(0) calc(${white}%) calc(${black}%))`,
        `hwb(max(0, 0) min(${white}, ${white}) max(${black}, ${black}))`,
      ]) {
        const parsed = parseCssColorExpression(source)
        expect(parsed && formatCssColor(parsed)).toBe(expected)
      }
    },
  )

  it.each([
    [
      'hwb(none calc(200%) calc(100%) / none)',
      'rgba(170, 170, 170, 0)',
      [true, false, false, true],
    ],
    [
      'hwb(calc(60) calc(200%) none)',
      'rgb(255, 255, 255)',
      [false, false, true, false],
    ],
    [
      'hwb(calc(60) none calc(200%))',
      'rgb(0, 0, 0)',
      [false, true, false, false],
    ],
  ])(
    'retains missing components when normalizing %s',
    (source, expected, missing) => {
      const parsed = parseCssColorExpression(source)
      expect(parsed?.missing).toStrictEqual(missing)
      expect(parsed && formatCssColor(parsed)).toBe(expected)
    },
  )

  it('normalizes large finite HWB channels without overflowing their sum', () => {
    const converted = convertCssColor(
      createCssColor('hwb', [0, 1e308, 1e308]),
      'srgb',
    )
    expect(converted.channels).toStrictEqual([0.5, 0.5, 0.5])
    expect(formatCssColor(converted)).toBe('rgb(128, 128, 128)')
  })

  it.each([
    'rgb(min(1, 2) 0)',
    'rgb(min(1, 2) 0 0 0)',
    'rgb(min(1, 2) 0 0 /)',
    'rgb(min(1, 2) 0 0 / .5 / .5)',
    'rgb(min(1, 2) 0 0 / calc(.5), .5)',
    'rgb(min(1, 2), 0, 0,)',
    'rgb(min(1, 2), 0, 0, calc(.5), .5)',
    'rgb(min(1, 2), 0, 0 / calc(.5))',
    'rgb(min(1, 2), 0 0)',
    'rgb(calc(10%), 0, 0)',
    'rgb(calc(10), 0%, 0%)',
    'rgb(none, calc(0), calc(0))',
    'rgb(calc(0), calc(0), calc(0), none)',
    'rgb(calc(0)calc(0) calc(0))',
    'hsl(calc(0), min(50, 100), 50%)',
    'hsl(calc(0), 100%, max(25, 50))',
    'hsla(calc(0), 100%, 50%,)',
    'hsl(none, calc(100%), calc(50%))',
    'hsl(min(0%, 100%) 100% 50%)',
    'hwb(min(0%, 100%) 0% 0%)',
    'hwb(calc(0), min(0%, 100%), 0%)',
    'lab(calc(50), min(0, 1), max(0, 1))',
    'oklab(calc(.5) calc(0deg) 0)',
    'lch(calc(50) 20 calc(10%))',
    'oklch(calc(.5) min(.1deg, .2deg) 0)',
    'color(srgb calc(.5), min(0, 1), max(0, 1))',
    'color(lab calc(.5) 0 0)',
    'color(srgb calc(.5) 0 0 / calc(1deg))',
    'rgb(calc(1deg) 0 0)',
    'rgb(min(1%, 2) 0 0)',
    'rgb(calc(1 + 2%) 0 0)',
    'rgb(clamp(0, 50%, 100) 0 0)',
    'hsl(calc(0deg + 1) 100% 50%)',
    'rgb(0 0 0 / max(.5, 50%))',
    'rgb(0 0 0 / clamp(0deg, 1deg, 2deg))',
    'rgb(min() 0 0)',
    'rgb(max(1,) 0 0)',
    'rgb(min(,1) 0 0)',
    'rgb(clamp(0, 1) 0 0)',
    'rgb(calc(1, 2) 0 0)',
    'rgb(calc(1+2) 0 0)',
    'rgb(calc(1 +2) 0 0)',
    'rgb(calc(1+ 2) 0 0)',
    'rgb(calc(- 1) 0 0)',
    'rgb(calc(--1) 0 0)',
    'rgb(min (1, 2) 0 0)',
    'rgb(calc(max (1, 2)) 0 0)',
    'rgb((calc(1)) 0 0)',
    'rgb(calc(1)px 0 0)',
    'rgb(calc(1 + 2) 0 0) trailing',
    'rgb(calc(1 + 2 0 0)',
    'rgb(calc(1 + 2)) 0 0)',
    'rgb(calc(none) 0 0)',
    'rgb(min(none, 10) 0 0)',
    'rgb(clamp(0, none, 10) 0 0)',
    'rgb(calc(r + 1) 0 0)',
    'rgb(min(r, 10) 0 0)',
    'rgb(0 0 0 / calc(alpha))',
    'rgb(calc(pi) 0 0)',
    'rgb(calc(infinity) 0 0)',
    'rgb(calc(NaN) 0 0)',
    'rgb(calc(var(--r)) 0 0)',
    'rgb(calc(env(red)) 0 0)',
    'rgb(sin(0) 0 0)',
    'rgb(round(1) 0 0)',
    'rgb(calc(1px) 0 0)',
    'rgb(calc("10") 0 0)',
    'rgb(calc([10]) 0 0)',
    'rgb(calc(10/*comment*/ + 1) 0 0)',
  ])('rejects invalid or unsupported absolute syntax %s', source => {
    expect(parseCssColorExpression(source)).toBeNull()
  })

  it.each([
    'rgb(calc(1 / 0) 0 0)',
    'rgb(min(0, 1e999) 0 0)',
    'rgb(clamp(0, 1e308 * 2, 255) 0 0)',
    'rgb(max(0, -1e999) 0 0)',
    'rgb(calc(1 / (1e308 * 2)) 0 0)',
    'rgb(0 0 0 / min(1, 1e999))',
    'rgb(0 0 0 / clamp(0, 1e308 * 2, 1))',
    'rgb(0 0 0 / 1e999)',
    'rgb(0, 0, 0, -1e999%)',
    'hsl(calc(1e308turn) 100% 50%)',
    'hsl(1e308turn 100% 50%)',
    'lab(50 calc(1.5e308%) 0)',
    'lch(50 calc(1.5e308%) 0)',
    'oklab(calc(1e308 * 2) 0 0)',
    'color(srgb calc(1e308 * 2) 0 0)',
  ])('rejects non-finite values before clamping %s', source => {
    expect(parseCssColorExpression(source)).toBeNull()
  })

  it.each([
    'lab(50% calc(1e308) 0)',
    'oklab(.5 calc(1e308) 0)',
    'lch(50 calc(1e308) 90)',
    'oklch(.5 calc(1e308) 90)',
    'color(display-p3 calc(1e308) 0 0)',
    'color(xyz-d65 calc(1e308) 0 0)',
    'hsl(120 calc(1e308) calc(1e308))',
    'lab(from lab(50 0 0) l calc(1e308) b)',
    'color-mix(in srgb, lab(50 calc(1e308) 0), blue)',
    'color-mix(in lab, lab(50 calc(1e308) 0), lab(50 0 0))',
  ])(
    'rejects finite channels that overflow during preview conversion: %s',
    invalid => {
      expect(parseCssColorExpression(invalid)).toBeNull()
      const valid = 'rgb(calc(255) 0 0)'
      const source = `${invalid}; ${valid}`
      expect(findColorFunctions(source).at(-1)).toStrictEqual({
        start: invalid.length + 2,
        end: source.length,
        color: 'rgb(255, 0, 0)',
      })
      expect(
        findColorFunctions(invalid).every(
          match => !/NaN|Infinity/u.test(match.color),
        ),
      ).toBe(true)
    },
  )

  it('accepts large finite values without artificial scaling overflow', () => {
    expect(parseCssColorExpression('rgb(calc(1e308%) 0 0)')?.channels[0]).toBe(
      1,
    )
    expect(parseCssColorExpression('lab(calc(1e308%) 0 0)')?.channels[0]).toBe(
      100,
    )
    expect(
      parseCssColorExpression('hsl(0 calc(1e308%) 50%)')?.channels[1],
    ).toBe(1e306)
  })

  it.each(['calc', 'min', 'max'])(
    'enforces the shared math nesting limit for %s()',
    name => {
      const component = `${`${name}(`.repeat(32)}1${')'.repeat(32)}`
      expect(parseCssColorExpression(`rgb(${component} 0 0)`)).not.toBeNull()
      expect(
        parseCssColorExpression(`rgb(${name}(${component}) 0 0)`),
      ).toBeNull()
    },
  )

  it('enforces math token and source length limits at component boundaries', () => {
    const maxTokens = `min(${Array.from({ length: 127 }, () => '1').join(',')})`
    const maxLength = `calc(${' '.repeat(4089)}1)`
    expect(maxLength).toHaveLength(4096)
    expect(parseCssColorExpression(`rgb(${maxTokens} 0 0)`)).not.toBeNull()
    expect(parseCssColorExpression(`rgb(${maxLength} 0 0)`)).not.toBeNull()
    expect(
      parseCssColorExpression(`rgb(${maxTokens.replace(')', ',1)')} 0 0)`),
    ).toBeNull()
    expect(
      parseCssColorExpression(`rgb(${maxLength.replace(')', ' )')} 0 0)`),
    ).toBeNull()
  })

  it.each([
    `rgb(${'min('.repeat(34)}1${')'.repeat(34)} 0 0)`,
    `rgb(min(${Array.from({ length: 130 }, () => '1').join(',')}) 0 0)`,
    `rgb(calc(${' '.repeat(4096)}1) 0 0)`,
    `rgb(${'0 '.repeat(10_000)})`,
    `hsl(${'0,'.repeat(10_000)})`,
    `rgb(${'min('.repeat(10_000)}`,
  ])(
    'recovers adjacent valid colors after an excessive expression',
    invalid => {
      const valid = 'rgb(min(255, 300) calc(0) max(0, -1))'
      const source = `${invalid}; ${valid}`
      expect(parseCssColorExpression(invalid)).toBeNull()
      expect(findColorFunctions(source)).toStrictEqual([
        {
          start: invalid.length + 2,
          end: source.length,
          color: 'rgb(255, 0, 0)',
        },
      ])
    },
  )
})
