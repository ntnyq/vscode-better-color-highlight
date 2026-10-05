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
    ['rgb(from red min(r, 20) g b)', 'rgb(20, 0, 0)'],
    ['rgb(from red max(r / 2, 20) g b)', 'rgb(128, 0, 0)'],
    ['rgb(from red clamp(20, r / 2, 100) g b)', 'rgb(100, 0, 0)'],
    ['rgb(from red clamp(200, r, 100) g b)', 'rgb(200, 0, 0)'],
    ['rgb(from red min(80%, 50%) g b)', 'rgb(128, 0, 0)'],
    ['rgb(from red clamp(none, r / 2, none) g b)', 'rgb(128, 0, 0)'],
    ['rgb(from red clamp(none, r, 100) g b)', 'rgb(100, 0, 0)'],
    ['rgb(from red clamp(100, r / 4, none) g b)', 'rgb(100, 0, 0)'],
    ['rgb(from red calc(min(r, 128) + max(g, 20)) g b)', 'rgb(148, 0, 0)'],
    ['rgb(from red min(calc(r / 2), max(20, 100)) g b)', 'rgb(100, 0, 0)'],
    ['rgb(from red MIN(r, 128) g b / CLAMP(0, .5, 1))', 'rgba(128, 0, 0, 0.5)'],
    ['hsl(from red calc(h + 120) s l)', 'rgb(0, 255, 0)'],
    ['hsl(from red min(.5turn, 200grad, 180deg) s l)', 'rgb(0, 255, 255)'],
    ['hsl(from red max(0deg, 3.141592653589793rad) s l)', 'rgb(0, 255, 255)'],
    ['hsl(from red h clamp(0%, 75%, 50%) l)', 'rgb(191, 64, 64)'],
    ['hsla(from red .5turn s l / .4)', 'rgba(0, 255, 255, 0.4)'],
    ['hwb(from red h w b / .5)', 'rgba(255, 0, 0, 0.5)'],
    ['hwb(from rgb(255 0 0) calc(h + 240) w b)', 'rgb(0, 0, 255)'],
    ['lab(from lab(50 20 30) l a b)', 'rgb(161, 105, 69)'],
    ['alpha(from red / .25)', 'rgba(255, 0, 0, 0.25)'],
    ['alpha(from red / min(alpha, .5))', 'rgba(255, 0, 0, 0.5)'],
    ['alpha(from red / clamp(20%, 80%, 50%))', 'rgba(255, 0, 0, 0.5)'],
    ['alpha(from red / max(alpha, 2))', 'rgb(255, 0, 0)'],
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

  it.each([
    ['rgb', 'r g b'],
    ['hsl', 'h s l'],
    ['hwb', 'h w b'],
    ['lab', 'l a b'],
    ['lch', 'l c h'],
    ['oklab', 'l a b'],
    ['oklch', 'l c h'],
  ])('converts the origin into the %s channel space', (name, names) => {
    const parsed = parseCssColorExpression(`${name}(from #336699 ${names})`)
    expect(parsed && formatCssColor(parsed)).toBe('rgb(51, 102, 153)')
    const components = names.split(' ')
    const mathParsed = parseCssColorExpression(
      `${name}(from #336699 min(${components[0]}) max(${components[1]}, ${components[1]}) clamp(none, ${components[2]}, none))`,
    )
    expect(mathParsed && formatCssColor(mathParsed)).toBe('rgb(51, 102, 153)')
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
  ])('supports relative color() in %s', space => {
    const parsed = parseCssColorExpression(
      `color(from #336699 ${space} ${space.startsWith('xyz') ? 'x y z' : 'r g b'})`,
    )
    expect(parsed && formatCssColor(parsed)).toBe('rgb(51, 102, 153)')
    const names = space.startsWith('xyz') ? ['x', 'y', 'z'] : ['r', 'g', 'b']
    const mathParsed = parseCssColorExpression(
      `color(from #336699 ${space} min(${names[0]}) max(${names[1]}, ${names[1]}) clamp(none, ${names[2]}, none))`,
    )
    expect(mathParsed && formatCssColor(mathParsed)).toBe('rgb(51, 102, 153)')
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

  it.each([
    'min()',
    'max()',
    'min(, r)',
    'max(r,)',
    'min(r,, 20)',
    'max(r 20)',
    'clamp(r)',
    'clamp(0, r)',
    'clamp(0, r, 255, 300)',
    'clamp(0,, 255)',
    'clamp(0, none, 255)',
    'min(none, r)',
    'max(r, none)',
    'clamp(calc(none), r, 255)',
    'min (r, 20)',
    'min(r+1, 255)',
    'max(r +1, 255)',
    'min(r, 10%)',
    'clamp(0%, r, 100%)',
    'min(10deg, 20deg)',
    'min(r, bogus)',
    'max(r, round(20))',
    'min(r, var(--cap))',
    'min(r, 1 / 0)',
    'min(r, 1e999)',
    'max(r, -1e999)',
    'clamp(0, 1e308 * 2, 255)',
    'min(r, (1e308 * 2) / 2)',
  ])('rejects invalid comparison component %s', component => {
    expect(parseCssColorExpression(`rgb(from red ${component} g b)`)).toBeNull()
  })

  it.each([
    'hsl(from red min(h, 120deg) s l)',
    'hsl(from red min(10%, 20%) s l)',
    'alpha(from red / min(alpha, 50%))',
    'alpha(from red / clamp(0deg, 10deg, 20deg))',
  ])('rejects comparison units incompatible with the channel: %s', source => {
    expect(parseCssColorExpression(source)).toBeNull()
  })

  it('uses missing channels as zero in math while retaining explicit none', () => {
    expect(
      parseCssColorExpression(
        'rgb(from rgb(none none none / none) min(r, 20) max(g, 10) none / clamp(none, alpha, none))',
      ),
    ).toMatchObject({
      channels: [0, 10 / 255, 0],
      alpha: 0,
      missing: [false, false, true, false],
    })
  })

  it.each([
    `min(${'min('.repeat(34)}r${')'.repeat(34)})`,
    `max(r${', r'.repeat(130)})`,
    `clamp(none, ${' '.repeat(4096)}r, none)`,
  ])('recovers after an over-limit comparison component', component => {
    const invalid = `rgb(from red ${component} g b)`
    const valid = 'rgb(from blue min(r, 128) max(g, 0) clamp(0, b, 255))'
    const source = `${invalid}; ${valid}`
    expect(parseCssColorExpression(invalid)).toBeNull()
    expect(findColorFunctions(source)).toStrictEqual([
      {
        start: invalid.length + 2,
        end: source.length,
        color: 'rgb(0, 0, 255)',
      },
    ])
  })

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
