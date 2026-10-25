import { describe, expect, it } from 'vitest'
import { findColorFunctions } from '../../../../src/engine/strategies/color-functions'
import { evaluateColorCalc } from '../../../../src/engine/strategies/css-color/calc'
import {
  formatCssColor,
  parseCssColorExpression,
} from '../../../../src/engine/strategies/css-color/parser'

const CHANNELS = new Map([
  ['r', 125],
  ['alpha', 0.75],
])

describe('static CSS sign-related calculations', () => {
  it.each([
    ['abs(-12.5)', 12.5, 'number'],
    ['abs(+12.5)', 12.5, 'number'],
    ['abs(20 - 50)', 30, 'number'],
    ['abs(-25%)', 25, 'percentage'],
    ['abs(-.5turn)', 180, 'angle'],
    ['abs(-200grad)', 180, 'angle'],
    ['abs(-3.141592653589793rad)', 180, 'angle'],
    ['ABS(-1e2)', 100, 'number'],
    ['sign(-12.5)', -1, 'number'],
    ['sign(12.5)', 1, 'number'],
    ['sign(-25%)', -1, 'number'],
    ['sign(25%)', 1, 'number'],
    ['sign(-.5turn)', -1, 'number'],
    ['sign(200grad)', 1, 'number'],
    ['SIGN(1rad)', 1, 'number'],
    ['sign(1e308)', 1, 'number'],
    ['sign(-5e-324)', -1, 'number'],
    ['abs(-1.7976931348623157e308)', Number.MAX_VALUE, 'number'],
    ['abs(-5e-324)', Number.MIN_VALUE, 'number'],
    ['abs(r - 255)', 130, 'number'],
    ['sign(alpha - 1)', -1, 'number'],
    ['calc(sign(-20%) * 25%)', -25, 'percentage'],
    ['calc(abs(-20%) * sign(1deg))', 20, 'percentage'],
    ['abs(min(-50%, -25%))', 50, 'percentage'],
    ['round(abs(-1.15), .1)', 1.2, 'number'],
    ['sign(rem(-10, 3))', -1, 'number'],
    ['abs(clamp(-20deg, -10deg, 0deg))', 10, 'angle'],
    ['min(abs(-10), max(0, sign(2) * 5))', 5, 'number'],
    ['calc(abs(-0) + sign(1))', 1, 'number'],
  ])('evaluates %s with its result type', (source, value, unit) => {
    expect(evaluateColorCalc(source, CHANNELS)).toStrictEqual({ value, unit })
  })

  it.each([
    ['abs(0)', 0],
    ['abs(-0)', 0],
    ['abs(-0%)', 0],
    ['abs(-0deg)', 0],
    ['sign(0)', 0],
    ['sign(-0)', -0],
    ['sign(-0%)', -0],
    ['sign(-0deg)', -0],
    ['sign(min(-0, 0))', -0],
    ['sign(max(-0, 0))', 0],
    ['sign(round(up, -.1))', -0],
    ['sign(abs(-0))', 0],
    ['abs(sign(-0))', 0],
  ])('preserves the specified zero sign in %s', (source, value) => {
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(value)
  })

  it.each([
    'abs()',
    'sign()',
    'abs(1, 2)',
    'sign(1, 2)',
    'abs(,1)',
    'sign(1,)',
    'abs(1 2)',
    'sign(1',
    'abs(1))',
    'abs (1)',
    'calc(sign (1))',
    'abs(- 1)',
    'sign(-(1))',
    'abs(-r)',
    'sign(1+ 2)',
    'abs(1 +2)',
    'abs(1%, 2%)',
    'abs(1% + 1)',
    'sign(1deg + 1%)',
    'abs(1px)',
    'sign(1em)',
    'sign(none)',
    'abs(infinity)',
    'sign(NaN)',
    'sign(pi)',
    'abs(var(--value))',
    'sign(bogus)',
    'abs(1);',
    'sign(1)px',
    '-abs(1)',
    'abs(1) + 1',
    'sign(1e999)',
    'abs(-1e999)',
    'sign(1 / 0)',
    'sign(1e308 * 2)',
    'min(0, abs(1e308 * 2))',
    'sign(1e308turn)',
    'abs(1 / sign(-0))',
  ])('rejects invalid, unsupported, or non-finite %s', source => {
    expect(evaluateColorCalc(source, CHANNELS)).toBeNull()
  })

  it.each(['abs', 'sign'])(
    'rejects non-finite channel inputs in %s()',
    name => {
      for (const value of [Infinity, -Infinity, Number.NaN]) {
        expect(
          evaluateColorCalc(`${name}(r)`, new Map([['r', value]])),
        ).toBeNull()
      }
    },
  )

  it.each(['abs', 'sign'])(
    'shares exact nesting, token, and character limits with %s()',
    name => {
      const nested = `${`${name}(`.repeat(32)}1${')'.repeat(32)}`
      expect(evaluateColorCalc(nested, CHANNELS)?.value).toBe(1)
      expect(evaluateColorCalc(`calc(${nested})`, CHANNELS)).toBeNull()
      const tokens = `${name}(${Array.from({ length: 127 }, () => '1').join(' + ')})`
      expect(evaluateColorCalc(tokens, CHANNELS)).not.toBeNull()
      expect(
        evaluateColorCalc(tokens.replace(')', ' + 1)'), CHANNELS),
      ).toBeNull()
      const source = `${name}(${' '.repeat(4093 - name.length)}1)`
      expect(source).toHaveLength(4096)
      expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(1)
      expect(evaluateColorCalc(`${source} `, CHANNELS)).toBeNull()
    },
  )

  it('shares nesting limits with every other calculation family', () => {
    const source = `${'abs(sign(min(round('.repeat(8)}1${', 1), 2)))'.repeat(8)}`
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(1)
    expect(evaluateColorCalc(`max(${source})`, CHANNELS)).toBeNull()
  })

  it.each([
    [
      'rgb(abs(-128) calc(sign(-10) * -64) 0 / abs(-.5))',
      'rgba(128, 64, 0, 0.5)',
    ],
    ['rgba(abs(-50%), 0%, 0%, sign(20%))', 'rgb(128, 0, 0)'],
    ['hsl(abs(-120deg) abs(-100%) 50%)', 'rgb(0, 255, 0)'],
    ['hsl(sign(-120deg) abs(-100%) 50%)', 'rgb(255, 0, 4)'],
    ['hsl(0 sign(-10%) 50%)', 'rgb(128, 128, 128)'],
    ['hwb(abs(-120deg) 0% 0% / abs(-.5))', 'rgba(0, 255, 0, 0.5)'],
    ['lab(abs(-50) 0 0)', 'rgb(119, 119, 119)'],
    ['oklch(abs(-.5) 0 sign(-.5turn))', 'rgb(99, 99, 99)'],
    ['color(srgb sign(50%) 0 0 / abs(-.5))', 'rgba(255, 0, 0, 0.5)'],
    ['rgb(from red abs(r - 127) calc(sign(-25%) * -64) b)', 'rgb(128, 64, 0)'],
    ['alpha(from red / abs(alpha - 1.75))', 'rgba(255, 0, 0, 0.75)'],
    ['color-mix(in srgb, red abs(-25%), blue)', 'rgb(64, 0, 191)'],
    [
      'color-mix(in srgb, abs(-25%) red, blue calc(sign(1deg) * 75%))',
      'rgb(64, 0, 191)',
    ],
    ['color-mix(in srgb, red abs(-125%), blue)', 'rgb(255, 0, 0)'],
    [
      'color-mix(in srgb, red calc(sign(-1) * 50%), blue calc(0%))',
      'rgba(0, 0, 0, 0)',
    ],
    ['rgb(from color(srgb abs(-1) 0 0) sign(r) g b)', 'rgb(1, 0, 0)'],
  ])('owns the complete color expression %s', (source, color) => {
    const parsed = parseCssColorExpression(source)
    expect(parsed && formatCssColor(parsed)).toBe(color)
    expect(findColorFunctions(source)).toStrictEqual([
      { start: 0, end: source.length, color },
    ])
  })

  it.each([
    'rgb(abs(-10deg) 0 0)',
    'hsl(abs(-10%) 100% 50%)',
    'hsl(0, sign(-10%), 50%)',
    'rgba(abs(-50%), sign(0), 0%, 1)',
    'rgb(0 0 0 / abs(-1deg))',
    'rgb(from red abs(-10deg) g b)',
    'color-mix(in srgb, red sign(50%), blue)',
    'color-mix(in srgb, red abs(-50), blue)',
    'color-mix(in srgb, red abs(-50deg), blue)',
  ])(
    'rejects incompatible result types at the color boundary in %s',
    source => {
      expect(parseCssColorExpression(source)).toBeNull()
    },
  )

  it('recovers later complete colors after unclosed sign functions', () => {
    const invalid = `rgb(${'abs(sign('.repeat(10_000)}1; `
    const valid = 'rgb(abs(-128) 0 0)'
    expect(findColorFunctions(invalid + valid)).toStrictEqual([
      {
        start: invalid.length,
        end: invalid.length + valid.length,
        color: 'rgb(128, 0, 0)',
      },
    ])
  })
})
