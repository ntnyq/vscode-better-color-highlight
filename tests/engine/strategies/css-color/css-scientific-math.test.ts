import { describe, expect, it } from 'vitest'
import { findColorFunctions } from '../../../../src/engine/strategies/color-functions'
import { evaluateColorCalc } from '../../../../src/engine/strategies/css-color/calc'
import {
  formatCssColor,
  parseCssColorExpression,
} from '../../../../src/engine/strategies/css-color/parser'

const CHANNELS = new Map([
  ['r', 128],
  ['alpha', 0.5],
])
const FUNCTION_NAMES = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'pow',
  'sqrt',
  'hypot',
  'log',
  'exp',
]

describe('static CSS trigonometric and exponential calculations', () => {
  it.each([
    'cos(90deg)',
    'cos(270deg)',
    'cos(pi / 2)',
    'sin(180deg)',
    'sin(pi)',
    'tan(180deg)',
    'tan(pi)',
  ])('keeps the exact zero in %s from becoming a non-zero sign', source => {
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(0)
    expect(evaluateColorCalc(`sign(${source})`, CHANNELS)?.value).toBe(0)
  })

  it('counts signed numeric tokens independently of nesting depth', () => {
    for (const literal of ['-0', '+0', '-1', '+1']) {
      const source = `${'abs('.repeat(32)}${literal}${')'.repeat(32)}`
      expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(
        Math.abs(Number(literal)),
      )
      expect(evaluateColorCalc(`abs(${source})`, CHANNELS)).toBeNull()
    }
  })

  it('retains the sign of adjacent representable angles without an epsilon cutoff', () => {
    expect(
      evaluateColorCalc('cos(89.99999999999999deg)', CHANNELS)?.value,
    ).toBeGreaterThan(0)
    expect(
      evaluateColorCalc('cos(90.00000000000001deg)', CHANNELS)?.value,
    ).toBeLessThan(0)
    expect(
      evaluateColorCalc('tan(89.99999999999999deg)', CHANNELS)?.value,
    ).toBeGreaterThan(1e15)
    expect(
      evaluateColorCalc('tan(90.00000000000001deg)', CHANNELS)?.value,
    ).toBeLessThan(-1e15)
    expect(
      evaluateColorCalc('sin(3.1415926535897927)', CHANNELS)?.value,
    ).toBeGreaterThan(0)
    expect(
      evaluateColorCalc('sin(3.1415926535897936)', CHANNELS)?.value,
    ).toBeLessThan(0)
  })

  it.each([
    ['sin(-0)', -0],
    ['tan(-0deg)', -0],
    ['sin(-180deg)', 0],
    ['tan(-180deg)', 0],
    ['cos(-90deg)', 0],
    ['sin(270deg)', -1],
    ['sin(-270deg)', 1],
    ['cos(-180deg)', -1],
  ])('preserves exact quadrant endpoints in %s', (source, expected) => {
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(expected)
  })

  it.each(FUNCTION_NAMES)(
    'rejects non-finite operands before evaluating %s',
    name => {
      let args = 'r'
      if (name === 'pow') {
        args = 'r, 0'
      } else if (name === 'atan2') {
        args = 'r, 1'
      }
      for (const value of [Infinity, -Infinity, Number.NaN]) {
        expect(
          evaluateColorCalc(`${name}(${args})`, new Map([['r', value]])),
        ).toBeNull()
      }
    },
  )

  it.each([
    ['calc(pi)', Math.PI, 'number'],
    ['calc(E)', Math.E, 'number'],
    ['sign(pi)', 1, 'number'],
    ['min(e, pi)', Math.E, 'number'],
    ['calc(pi * 2rad)', 360, 'angle'],
    ['sin(pi / 2)', 1, 'number'],
    ['sin(90deg)', 1, 'number'],
    ['sin(100grad)', 1, 'number'],
    ['sin(.25turn)', 1, 'number'],
    ['sin(1.5707963267948966rad)', 1, 'number'],
    ['SIN(-.25turn)', -1, 'number'],
    ['sin(450deg)', 1, 'number'],
    ['cos(pi)', -1, 'number'],
    ['cos(180deg)', -1, 'number'],
    ['cos(-.5turn)', -1, 'number'],
    ['tan(pi / 4)', 1, 'number'],
    ['tan(45deg)', 1, 'number'],
    ['tan(-45deg)', -1, 'number'],
    ['asin(.5)', 30, 'angle'],
    ['acos(.5)', 60, 'angle'],
    ['atan(1)', 45, 'angle'],
    ['atan2(1, -1)', 135, 'angle'],
    ['ATAN2(-1, -1)', -135, 'angle'],
    ['atan2(25%, -25%)', 135, 'angle'],
    ['atan2(100grad, -.25turn)', 135, 'angle'],
    ['sin(asin(.5))', 0.5, 'number'],
    ['cos(acos(.5))', 0.5, 'number'],
    ['tan(atan(2))', 2, 'number'],
    ['pow(2, 7)', 128, 'number'],
    ['pow(-2, 3)', -8, 'number'],
    ['pow(4, -.5)', 0.5, 'number'],
    ['pow(0, 0)', 1, 'number'],
    ['sqrt(16384)', 128, 'number'],
    ['sqrt(pow(r, 2))', 128, 'number'],
    ['hypot(3, 4)', 5, 'number'],
    ['hypot(2, 3, 6)', 7, 'number'],
    ['hypot(-25%)', 25, 'percentage'],
    ['hypot(30%, 40%)', 50, 'percentage'],
    ['hypot(30deg, .1111111111111111turn)', 50, 'angle'],
    ['log(e)', 1, 'number'],
    ['log(8, 2)', 3, 'number'],
    ['log(2, .5)', -1, 'number'],
    ['exp(1)', Math.E, 'number'],
    ['exp(log(alpha))', 0.5, 'number'],
    ['calc(pow(2, 6) + hypot(3, 4) * log(e))', 69, 'number'],
    ['round(sqrt(2), .1)', 1.4, 'number'],
    ['calc(sin(90deg) * 25%)', 25, 'percentage'],
  ])('evaluates %s with its result type', (source, value, unit) => {
    const result = evaluateColorCalc(source, CHANNELS)
    expect(result?.unit).toBe(unit)
    expect(result?.value).toBeCloseTo(value, 12)
  })

  it.each([
    ['sin(-0)', -0],
    ['sin(-0deg)', -0],
    ['tan(-0)', -0],
    ['asin(-0)', -0],
    ['atan(-0)', -0],
    ['acos(1)', 0],
    ['atan2(-0, 1)', -0],
    ['atan2(0, -0)', 180],
    ['atan2(-0, -0)', -180],
    ['atan2(-0, -1)', -180],
    ['sqrt(-0)', -0],
    ['pow(-0, 3)', -0],
    ['pow(-0, 2)', 0],
    ['hypot(-0, -0)', 0],
    ['log(1, .5)', 0],
    ['exp(-1000)', 0],
  ])(
    'retains specified zero signs and angle endpoints in %s',
    (source, value) => {
      expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(value)
    },
  )

  it.each([
    'pi',
    'e',
    '+pi',
    '-e',
    'calc(-pi)',
    'calc(+e)',
    'calc(infinity)',
    'calc(NaN)',
    'calc(pi%)',
    'calc(2pi)',
    'sin(1%)',
    'cos(1px)',
    'tan(none)',
    'asin(1deg)',
    'acos(1%)',
    'atan(1rad)',
    'atan2(1%, 1)',
    'atan2(1deg, 1%)',
    'pow(2%, 2)',
    'pow(2, 2deg)',
    'sqrt(4%)',
    'sqrt(4deg)',
    'hypot(3, 4%)',
    'hypot(3deg, 4)',
    'log(2%, 2)',
    'exp(1deg)',
    'sin(1+ 2)',
    'pow(1 +2, 2)',
    'atan2 (1, 2)',
    'calc(atan2 (1, 2))',
    'atan20(1, 2)',
    'atan2x(1, 2)',
    'sin2(0)',
    'sin(0)px',
    'sin(0) + 1',
    'calc(sin(0)) trailing',
    'hypot(1,)',
    'pow(1)',
    'pow(1, 2, 3)',
    'atan2(1)',
    'atan2(1, 2, 3)',
    'log(1, 2, 3)',
    'log(1,)',
    'sin(1, 2)',
    'sqrt(1, 2)',
    'asin(1.0001)',
    'acos(-1.0001)',
    'sqrt(-1)',
    'pow(-2, .5)',
    'pow(0, -1)',
    'pow(1e308, 2)',
    'exp(1000)',
    'log(0)',
    'log(-0)',
    'log(-1)',
    'log(2, 0)',
    'log(2, -0)',
    'log(2, -1)',
    'log(2, 1)',
    'log(1, 0)',
    'log(1, 1)',
    'hypot(1.3e308, 1.3e308)',
    'sin(1e999)',
    'sin(1e308turn)',
    'sin(1e308 * 2)',
    'atan(1e308 * 2)',
    'pow(1e308 * 2, 0)',
    'pow(sqrt(-1), 0)',
    'min(0, exp(1000))',
    'exp(log(0))',
    'tan(90deg)',
    'tan(270deg)',
    'tan(-90deg)',
    'tan(pi / 2)',
    'sin(tan(90deg))',
    'hypot(var(--missing), 1)',
  ])('rejects invalid types, syntax, domains, or non-finite %s', source => {
    expect(evaluateColorCalc(source, CHANNELS)).toBeNull()
  })

  it.each(FUNCTION_NAMES)('enforces argument boundaries for %s()', name => {
    for (const args of ['', ',1', '1,', '1 2', '1;2', 'r']) {
      // A non-finite channel must fail even when an outer operation hides it.
      expect(
        evaluateColorCalc(`${name}(${args})`, new Map([['r', Infinity]])),
      ).toBeNull()
    }
    expect(evaluateColorCalc(`${name} (1)`, CHANNELS)).toBeNull()
    expect(evaluateColorCalc(`${name}(1`, CHANNELS)).toBeNull()
  })

  it('keeps extreme finite inputs without overflow from intermediate formulas', () => {
    expect(
      evaluateColorCalc('hypot(1e308, 1e308)', CHANNELS)?.value,
    ).toBeCloseTo(1.4142135623730951e308, -294)
    expect(evaluateColorCalc('hypot(3e-300, 4e-300)', CHANNELS)?.value).toBe(
      5e-300,
    )
    expect(evaluateColorCalc('sin(1e308)', CHANNELS)?.value).toBeCloseTo(
      0.4533964905016491,
      12,
    )
    expect(evaluateColorCalc('atan2(1e308, 1e308)', CHANNELS)?.value).toBe(45)
    expect(evaluateColorCalc('log(5e-324)', CHANNELS)?.value).toBeCloseTo(
      -744.4400719213812,
      10,
    )
    expect(
      evaluateColorCalc('tan(89.999deg)', CHANNELS)?.value,
    ).toBeGreaterThan(57_000)
    expect(evaluateColorCalc('tan(90.001deg)', CHANNELS)?.value).toBeLessThan(
      -57_000,
    )
  })

  it('shares exact nesting, token, and character limits across function families', () => {
    const nested = `${'sqrt('.repeat(32)}1${')'.repeat(32)}`
    expect(evaluateColorCalc(nested, CHANNELS)?.value).toBe(1)
    expect(evaluateColorCalc(`hypot(${nested})`, CHANNELS)).toBeNull()
    const mixed = `${'hypot(pow(sqrt('.repeat(10)}1${'), 2))'.repeat(10)}`
    expect(evaluateColorCalc(mixed, CHANNELS)?.value).toBe(1)
    expect(evaluateColorCalc(`sin(asin(abs(${mixed})))`, CHANNELS)).toBeNull()
    const tokens = `hypot(${Array.from({ length: 127 }, () => '0').join(',')})`
    expect(evaluateColorCalc(tokens, CHANNELS)?.value).toBe(0)
    expect(evaluateColorCalc(tokens.replace(')', ',0)'), CHANNELS)).toBeNull()
    const source = `sqrt(${' '.repeat(4089)}1)`
    expect(source).toHaveLength(4096)
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(1)
    expect(evaluateColorCalc(`${source} `, CHANNELS)).toBeNull()
  })

  it.each([
    ['rgb(calc(sign(cos(90deg)) * 255) 0 0)', 'rgb(0, 0, 0)'],
    [
      'color-mix(in srgb, red calc(sign(sin(pi)) * 100%), blue)',
      'rgb(0, 0, 255)',
    ],
    ['rgb(128 0 0 / abs(sign(tan(180deg))))', 'rgba(128, 0, 0, 0)'],
    [
      'rgb(calc(sin(pi / 2) * 128) pow(2, 6) sqrt(256) / exp(log(.5)))',
      'rgba(128, 64, 16, 0.5)',
    ],
    ['rgba(hypot(30%, 40%), 0%, 0%, cos(0))', 'rgb(128, 0, 0)'],
    ['hsl(atan2(1, -1), 100%, 50%)', 'rgb(0, 255, 64)'],
    ['hwb(acos(-1) 0% 0%)', 'rgb(0, 255, 255)'],
    ['lab(hypot(30, 40) 0 0)', 'rgb(119, 119, 119)'],
    ['lch(50 0 atan(1))', 'rgb(119, 119, 119)'],
    ['oklab(sqrt(.25) 0 0)', 'rgb(99, 99, 99)'],
    ['oklch(sqrt(.25) 0 asin(1))', 'rgb(99, 99, 99)'],
    ['color(srgb cos(0) sin(0) log(1))', 'rgb(255, 0, 0)'],
    [
      'rgb(from red sqrt(r * r) g b / pow(alpha / 2, 2))',
      'rgba(255, 0, 0, 0.25)',
    ],
    ['hsl(from red calc(h * 1deg + acos(-1)) s l)', 'rgb(0, 255, 255)'],
    ['alpha(from red / sqrt(alpha / 4))', 'rgba(255, 0, 0, 0.5)'],
    ['color-mix(in srgb, red hypot(30%, 40%), blue)', 'rgb(128, 0, 128)'],
    [
      'color-mix(in srgb, calc(sin(pi / 2) * 25%) red, blue)',
      'rgb(64, 0, 191)',
    ],
    ['color-mix(in srgb, red hypot(90%, 120%), blue)', 'rgb(255, 0, 0)'],
    ['rgb(calc(pi) calc(e) 0)', 'rgb(3, 3, 0)'],
  ])('owns the complete color expression %s', (source, color) => {
    const parsed = parseCssColorExpression(source)
    expect(parsed && formatCssColor(parsed)).toBe(color)
    expect(findColorFunctions(source)).toStrictEqual([
      { start: 0, end: source.length, color },
    ])
  })

  it.each([
    'rgb(pi 0 0)',
    'rgb(from red e g b)',
    'hsl(pi 100% 50%)',
    'rgb(asin(1) 0 0)',
    'rgb(0 0 0 / atan2(1, 1))',
    'rgb(from red atan(1) g b)',
    'hsl(hypot(30%, 40%) 100% 50%)',
    'hsl(from red calc(h + acos(-1)) s l)',
    'rgba(hypot(30%, 40%), sin(0), 0%, 1)',
    'hsl(0, sin(1), 50%)',
    'color-mix(in srgb, red sin(1), blue)',
    'color-mix(in srgb, red pow(50%, 1), blue)',
  ])('enforces destination types in %s', source => {
    expect(parseCssColorExpression(source)).toBeNull()
  })

  it('recovers complete colors after unclosed or over-limit calculations', () => {
    const invalid = `rgb(${'sqrt(pow('.repeat(10_000)}1; rgb(hypot(${'1,'.repeat(200)}1) 0 0); `
    const valid = 'rgb(pow(2, 7) 0 0)'
    expect(findColorFunctions(invalid + valid)).toStrictEqual([
      {
        start: invalid.length,
        end: invalid.length + valid.length,
        color: 'rgb(128, 0, 0)',
      },
    ])
  })
})
