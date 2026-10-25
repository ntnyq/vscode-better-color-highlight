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

describe('static CSS stepped calculations', () => {
  it.each([
    ['round(2.5)', 3],
    ['round(-2.5)', -2],
    ['round(nearest, 25, 10)', 30],
    ['round(nearest, -25, 10)', -20],
    ['round(up, 21, 10)', 30],
    ['round(up, -21, 10)', -20],
    ['round(down, 29, 10)', 20],
    ['round(down, -21, 10)', -30],
    ['round(to-zero, 29, 10)', 20],
    ['round(to-zero, -29, 10)', -20],
    ['round(25, -10)', 30],
    ['round(down, -21, -10)', -30],
    ['ROUND(TO-ZERO, -2.9)', -2],
    ['round(r / 2, 10)', 60],
    ['round(up, alpha * 10)', 8],
    ['mod(18, 5)', 3],
    ['mod(-18, 5)', 2],
    ['mod(18, -5)', -2],
    ['mod(-18, -5)', -3],
    ['rem(18, 5)', 3],
    ['rem(-18, 5)', -3],
    ['rem(18, -5)', 3],
    ['rem(-18, -5)', -3],
    ['calc(round(r, 10) + mod(-18, 5) + rem(18, 5))', 135],
    ['clamp(0, round(down, max(r, 110), 10), 255)', 120],
    ['round(min(20, 25), max(5, 10))', 20],
    ['mod(1e308, 3)', 2],
  ])('evaluates %s', (source, value) => {
    expect(evaluateColorCalc(source, CHANNELS)).toStrictEqual({
      value,
      unit: 'number',
    })
  })

  it.each([
    ['round(26%, 10%)', 30, 'percentage'],
    ['round(down, 26%, 10%)', 20, 'percentage'],
    ['mod(-18%, 5%)', 2, 'percentage'],
    ['rem(-18%, 5%)', -3, 'percentage'],
    ['round(.4turn, 100grad)', 180, 'angle'],
    ['mod(-.5turn, 100grad)', 0, 'angle'],
    ['rem(200grad, .4turn)', 36, 'angle'],
  ])('retains the type of %s', (source, value, unit) => {
    const result = evaluateColorCalc(source, CHANNELS)
    expect(result?.unit).toBe(unit)
    expect(result?.value).toBeCloseTo(value, 12)
  })

  it.each([
    ['round(-0, 10)', -0],
    ['round(up, -1, 10)', -0],
    ['round(to-zero, -1, 10)', -0],
    ['round(down, 1, 10)', 0],
    ['mod(-10, 5)', 0],
    ['mod(10, -5)', -0],
    ['rem(-10, 5)', -0],
    ['rem(10, -5)', 0],
  ])('preserves signed zero in %s', (source, value) => {
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(value)
  })

  it.each([
    'round()',
    'round(1,)',
    'round(1, 2, 3)',
    'round(nearest)',
    'round(up 1, 2)',
    'round(sideways, 1, 2)',
    'round(line-width, 1, 2)',
    'round(to - zero, 1, 2)',
    'round(10%)',
    'round(90deg)',
    'round(1%, 2)',
    'round(1, 2deg)',
    'round(1, 0)',
    'round(1, -0)',
    'round(1e308, 1e-308)',
    'round(up, 1e308, 9e307)',
    'min(0, round(up, 1e308, 9e307))',
    'mod()',
    'mod(1)',
    'mod(1, 2, 3)',
    'mod(1,,2)',
    'mod(1, 0)',
    'rem(1, -0)',
    'rem(1, 2%)',
    'mod(1deg, 2%)',
    'mod(1, infinity)',
    'rem(1e999, 2)',
    'round(1 +2, 1)',
    'mod(var(--value), 2)',
    'rem(none, 2)',
    'calc(round (1))',
    'round(1)px',
  ])('rejects invalid or non-finite %s', source => {
    expect(evaluateColorCalc(source, CHANNELS)).toBeNull()
  })

  it.each(['round', 'mod', 'rem'])(
    'shares depth, token, and character limits with %s()',
    name => {
      const source = `${`${name}(`.repeat(32)}1${', 2)'.repeat(32)}`
      expect(evaluateColorCalc(source, CHANNELS)).not.toBeNull()
      expect(evaluateColorCalc(`calc(${source})`, CHANNELS)).toBeNull()
      expect(
        evaluateColorCalc(`${name}(${'1 + '.repeat(130)}1, 2)`, CHANNELS),
      ).toBeNull()
      expect(
        evaluateColorCalc(`${name}(${' '.repeat(4096)}1, 2)`, CHANNELS),
      ).toBeNull()
    },
  )

  it.each([
    ['rgb(round(127.5) mod(-10, 5) rem(21, 5))', 'rgb(128, 0, 1)'],
    ['rgba(round(49%, 10%), 0%, 0%, mod(75%, 50%))', 'rgba(128, 0, 0, 0.25)'],
    ['hsl(mod(-240deg, 1turn), round(99%, 10%), 50%)', 'rgb(0, 255, 0)'],
    [
      'rgb(from red round(r / 2) mod(g + 32, 256) rem(b + 64, 255))',
      'rgb(128, 32, 64)',
    ],
    ['alpha(from red / round(alpha / 3, .1))', 'rgba(255, 0, 0, 0.3)'],
  ])('owns the complete expression %s', (source, color) => {
    const parsed = parseCssColorExpression(source)
    expect(parsed && formatCssColor(parsed)).toBe(color)
    expect(findColorFunctions(source)).toStrictEqual([
      { start: 0, end: source.length, color },
    ])
  })
})
