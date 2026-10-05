import { describe, expect, it } from 'vitest'
import { evaluateColorCalc } from '../../../../src/engine/strategies/css-color/calc'

const CHANNELS = new Map([
  ['r', 120],
  ['g', 40],
  ['b', 20],
  ['alpha', 0.5],
])

describe('bounded CSS color calculations', () => {
  it.each([
    ['r', 120],
    ['-1.5e2', -150],
    ['calc(r + g * 2)', 200],
    ['calc((r + g) / 2)', 80],
    ['min(r)', 120],
    ['max(g)', 40],
    ['min(r, g, b, -10)', -10],
    ['max(-10, b, g, r)', 120],
    ['min(r / 2 + g, r - b)', 100],
    ['max((r + g) / 2, b * 3)', 80],
    ['calc(min(r, g) + max(b, 5))', 60],
    ['min(calc(r / 2), max(g, b))', 40],
    ['clamp(0, r, 255)', 120],
    ['clamp(0, -10, 255)', 0],
    ['clamp(0, 300, 255)', 255],
    ['clamp(100, 20, 50)', 100],
    ['clamp(r - g, (r + g) / 2, r + b)', 80],
    ['clamp(min(r, g), calc(b * 3), max(r, g))', 60],
    ['max(clamp(0, r, 100), min(g, b))', 100],
    ['clamp(none, -10, 255)', -10],
    ['clamp(0, 300, none)', 300],
    ['clamp(none, alpha * 2, none)', 1],
    ['calc(clamp(none, min(r, g), none) * 2)', 80],
    ['MAX(+1e1, -2.5, CLAMP(NONE, 20, NONE))', 20],
    ['min(1\t+\n2, 4)', 3],
  ])('evaluates %s', (source, value) => {
    expect(evaluateColorCalc(source, CHANNELS)).toStrictEqual({
      value,
      unit: 'number',
    })
  })

  it.each([
    ['min(20%, 50%, 10% * 3)', 20],
    ['max(20%, 50% / 2)', 25],
    ['clamp(20%, 10%, 50%)', 20],
    ['clamp(none, 60%, 50%)', 50],
    ['clamp(20%, 60%, none)', 60],
    ['clamp(none, 60%, none)', 60],
  ])('preserves the percentage unit in %s', (source, value) => {
    expect(evaluateColorCalc(source, CHANNELS)).toStrictEqual({
      value,
      unit: 'percentage',
    })
  })

  it.each([
    ['min(.5turn, 200grad, 180deg)', 180],
    ['max(90deg, 1rad)', 90],
    ['min(1turn, 1rad)', 180 / Math.PI],
    ['clamp(100grad, .5turn, 3.141592653589793rad)', 180],
    ['clamp(.5turn, 90deg, 100grad)', 180],
    ['clamp(none, 1rad, none)', 180 / Math.PI],
    ['calc(min(.5turn, 300deg) + 100grad)', 270],
  ])('normalizes angle units in %s', (source, value) => {
    const calculated = evaluateColorCalc(source, CHANNELS)
    expect(calculated?.unit).toBe('angle')
    expect(calculated?.value).toBeCloseTo(value, 12)
  })

  it.each([
    '',
    'min()',
    'max()',
    'min(,1)',
    'min(1,)',
    'max(1,,2)',
    'min(1 2)',
    'min(1,2',
    'max(1,2))',
    'clamp()',
    'clamp(1)',
    'clamp(1,2)',
    'clamp(1,2,3,4)',
    'clamp(1,,3)',
    'calc(1,2)',
    'min(1 +2, 3)',
    'max(1+ 2, 3)',
    'clamp(0, 1+2, 3)',
    'min(1 -2, 3)',
    'min(1- 2, 3)',
    'min (1,2)',
    'calc(max (1,2))',
    'min(calc (1),2)',
    'min(- 1, 2)',
    'min(--1, 2)',
    'min(-r, 2)',
    'min(-(1), 2)',
    'min(1,2) + 3',
    'min(1,2)px',
    '(min(1,2))',
    'min(1,2);',
    'min(1%, 2)',
    'max(0, 90deg)',
    'max(1%, 90deg)',
    'clamp(0%, 1%, 2)',
    'clamp(0deg, 1, 2deg)',
    'clamp(none, 1, 2%)',
    'clamp(0deg, 1%, none)',
    'min(1% * 2%, 3%)',
    'min(1deg / 2deg, 3)',
    'min(1, 1 / 0)',
    'max(1, 1 / -0)',
    'clamp(0, 1 / 0, 2)',
    'none',
    'min(none, 1)',
    'max(1, none)',
    'clamp(0, none, 1)',
    'clamp(none, none, none)',
    'clamp(none + 1, 2, 3)',
    'clamp(0, 1, none + 2)',
    'clamp(calc(none), 1, 2)',
    'clamp(none, 1, min(none, 2))',
    'min(bogus, 1)',
    'min(infinity, 1)',
    'max(-infinity, 1)',
    'min(NaN, 1)',
    'min(pi, 1)',
    'min(var(--r), 1)',
    'min(round(1), 1)',
    'min(1px, 2px)',
  ])('rejects invalid or unsupported %s', source => {
    expect(evaluateColorCalc(source, CHANNELS)).toBeNull()
  })

  it.each([
    '1e999',
    'calc(1 / 1e999)',
    'calc(1 / (1e308 * 2))',
    'min(0, 1e999)',
    'max(0, -1e999)',
    'clamp(0, 1e999, 1)',
    'clamp(-1e999, 0, 1)',
    'clamp(0, 1, 1e999)',
    'clamp(none, 1e999, none)',
    'min(0%, 1e999%)',
    'min(0deg, 1e308turn)',
    'min(0, 1e308 * 2)',
    'min(0, (1e308 * 2) / 2)',
    'min(0, 1e308 + 1e308)',
    'max(0, -1e308 - 1e308)',
    'min(0, 1e308 / 1e-308)',
    'clamp(0, 1e308 * 2, 1)',
  ])('rejects non-finite branches and intermediate values in %s', source => {
    expect(evaluateColorCalc(source, CHANNELS)).toBeNull()
  })

  it.each([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
    'rejects a non-finite channel value %s before selecting a branch',
    value => {
      const channels = new Map([['r', value]])
      for (const source of [
        'r',
        'min(0, r)',
        'max(0, r)',
        'clamp(0, r, 1)',
        'clamp(none, r, none)',
        'calc(1 / r)',
      ]) {
        expect(evaluateColorCalc(source, channels)).toBeNull()
      }
    },
  )

  it('accepts 4096 characters and rejects a longer expression', () => {
    const source = `min(${' '.repeat(4090)}1)`
    expect(source).toHaveLength(4096)
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(1)
    expect(evaluateColorCalc(`${source} `, CHANNELS)).toBeNull()
  })

  it('accepts 256 tokens and rejects additional arguments', () => {
    const source = `min(${Array.from({ length: 127 }, () => '1').join(',')})`
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(1)
    expect(evaluateColorCalc(source.replace(')', ',1)'), CHANNELS)).toBeNull()
  })

  it.each(['calc', 'min', 'max'])(
    'bounds nested %s() calls at depth 32',
    name => {
      const source = `${`${name}(`.repeat(32)}1${')'.repeat(32)}`
      expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(1)
      expect(evaluateColorCalc(`${name}(${source})`, CHANNELS)).toBeNull()
    },
  )

  it('shares the nesting limit between calculations and comparisons', () => {
    const source = `${'calc(min('.repeat(16)}1${'))'.repeat(16)}`
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(1)
    expect(evaluateColorCalc(`max(${source})`, CHANNELS)).toBeNull()
  })

  it('counts clamp nesting even when its bounds are none', () => {
    const source = `${'clamp(none,'.repeat(32)}1${',none)'.repeat(32)}`
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(1)
    expect(evaluateColorCalc(`clamp(none,${source},none)`, CHANNELS)).toBeNull()
  })
})
