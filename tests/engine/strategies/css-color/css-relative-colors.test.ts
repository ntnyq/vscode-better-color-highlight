import { describe, expect, it } from 'vitest'
import { findColorFunctions } from '../../../../src/engine/strategies/color-functions'
import {
  formatCssColor,
  parseCssColorExpression,
} from '../../../../src/engine/strategies/css-color/parser'

describe('static relative CSS colors', () => {
  it.each([
    ['rgb(from red r g b)', 'rgb(255, 0, 0)'],
    ['rgba(from #ff000080 r g b)', 'rgba(255, 0, 0, 0.502)'],
    ['rgb(from red b g r / 50%)', 'rgba(0, 0, 255, 0.5)'],
    ['rgb(from red calc(r / 2) calc(g + 20) b)', 'rgb(128, 20, 0)'],
    ['rgb(from red calc((r + 1) / 2) g b)', 'rgb(128, 0, 0)'],
    ['rgb(from red calc(r * calc(1 / 2)) g b)', 'rgb(128, 0, 0)'],
    ['rgb(from red calc(50% * 2) 0% 0%)', 'rgb(255, 0, 0)'],
    ['hsl(from red calc(h + 120) s l)', 'rgb(0, 255, 0)'],
    ['hsla(from red .5turn s l / .4)', 'rgba(0, 255, 255, 0.4)'],
    ['hwb(from red h w b / .5)', 'rgba(255, 0, 0, 0.5)'],
    ['hwb(from rgb(255 0 0) calc(h + 240) w b)', 'rgb(0, 0, 255)'],
    ['lab(from lab(50 20 30) l a b)', 'rgb(161, 105, 69)'],
    ['alpha(from red / .25)', 'rgba(255, 0, 0, 0.25)'],
    [
      'alpha(from rgb(255 0 0 / .5) / calc(alpha * .5))',
      'rgba(255, 0, 0, 0.25)',
    ],
    ['alpha(from red)', 'rgb(255, 0, 0)'],
    ['rgb(from rgb(none 0 0 / none) r g b)', 'rgba(0, 0, 0, 0)'],
    ['rgb(from red none g b / none)', 'rgba(0, 0, 0, 0)'],
    ['color(from red srgb b g r / 2)', 'rgb(0, 0, 255)'],
    ['color(from red srgb r g b / -1)', 'rgba(255, 0, 0, 0)'],
    ['rgb(from color-mix(in srgb, red, blue) r g b)', 'rgb(128, 0, 128)'],
    ['color-mix(in srgb, rgb(from red r g b), blue)', 'rgb(128, 0, 128)'],
  ])('resolves and owns %s', (source, color) =>
    expect(findColorFunctions(source)).toStrictEqual([
      { start: 0, end: source.length, color },
    ]),
  )

  it.each(['rgb', 'hsl', 'hwb', 'lab', 'lch', 'oklab', 'oklch'])(
    'converts the origin into the %s channel space',
    name => {
      const names = {
        rgb: 'r g b',
        hsl: 'h s l',
        hwb: 'h w b',
        lab: 'l a b',
        lch: 'l c h',
        oklab: 'l a b',
        oklch: 'l c h',
      }[name]
      const parsed = parseCssColorExpression(`${name}(from #336699 ${names})`)
      expect(parsed && formatCssColor(parsed)).toBe('rgb(51, 102, 153)')
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
  ])('supports relative color() in %s', space => {
    const parsed = parseCssColorExpression(
      `color(from #336699 ${space} ${space.startsWith('xyz') ? 'x y z' : 'r g b'})`,
    )
    expect(parsed && formatCssColor(parsed)).toBe('rgb(51, 102, 153)')
  })

  it.each([
    'rgb(from currentColor r g b)',
    'rgb(from var(--brand) r g b)',
    'rgb(from red r,g,b)',
    'rgb(from red r g)',
    'rgb(from red r g b /)',
    'rgb(from red r g b / alpha / 1)',
    'rgb(from red x y z)',
    'rgb(from red calc(r + 10%) g b)',
    'rgb(from red calc(r / 0) g b)',
    'rgb(from red calc(r * 1e999) g b)',
    'rgb(from red calc(r+1) g b)',
    'rgb(from red calc(r +1) g b)',
    'rgb(from red calc(-r) g b)',
    'rgb(from red calc(--1) g b)',
    'rgb(from red calc(calc (r)) g b)',
    'rgb(from red min(r, 20) g b)',
    'rgb(from red calc(r * bogus) g b)',
    'rgb(from red calc(r + 1)px g b)',
    'hsl(from red 20% s l)',
    'rgb(from red 20deg g b)',
    'color(from red lab l a b)',
    'alpha(from currentColor / .5)',
    'alpha(from red / r)',
  ])('rejects unsupported or invalid %s', source =>
    expect(parseCssColorExpression(source)).toBeNull(),
  )

  it('retains out-of-gamut channels and inherited missing components', () => {
    expect(
      parseCssColorExpression(
        'color(from color(display-p3 1.2 -0.2 .5 / .4) display-p3 r g b)',
      ),
    ).toMatchObject({ channels: [1.2, -0.2, 0.5], alpha: 0.4 })
    expect(
      parseCssColorExpression('lab(from lab(none 20 30) l a b)')?.missing[0],
    ).toBe(true)
  })

  it('retains a specified hue when restoring saturation or chroma', () => {
    expect(
      findColorFunctions('hsl(from hsl(120 0% 50%) h 100% l)')[0].color,
    ).toBe('rgb(0, 255, 0)')
    expect(
      parseCssColorExpression('oklch(from oklch(.5 0 240) l .2 h)'),
    ).toMatchObject({
      channels: [0.5, 0.2, 240],
      missing: [false, false, false, false],
    })
  })

  it('bounds color and arithmetic nesting without losing adjacent valid colors', () => {
    const nested = `${'rgb(from '.repeat(40)}red${' r g b)'.repeat(40)}`
    expect(parseCssColorExpression(nested)).toBeNull()
    expect(
      parseCssColorExpression(
        `rgb(from red calc(${'('.repeat(40)}r${')'.repeat(40)}) g b)`,
      ),
    ).toBeNull()
    const text = `${nested}; rgb(from blue r g b)`
    expect(findColorFunctions(text).at(-1)?.color).toBe('rgb(0, 0, 255)')
  })

  it('bounds otherwise valid arithmetic token and character counts', () => {
    expect(
      parseCssColorExpression(`rgb(from red calc(r${' + 0'.repeat(130)}) g b)`),
    ).toBeNull()
    expect(
      parseCssColorExpression(`rgb(from red calc(${' '.repeat(4096)}r) g b)`),
    ).toBeNull()
  })
})
