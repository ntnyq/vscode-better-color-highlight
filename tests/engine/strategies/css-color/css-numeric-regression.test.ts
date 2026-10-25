import { describe, expect, it } from 'vitest'
import { evaluateColorCalc } from '../../../../src/engine/strategies/css-color/calc'

const CHANNELS = new Map<string, number>()
const STRATEGIES = ['nearest', 'up', 'down', 'to-zero'] as const

describe('css numeric regression grids', () => {
  it.each(
    [10, 100, 1000].flatMap(scale =>
      STRATEGIES.map(strategy => ({ scale, strategy })),
    ),
  )(
    'rounds decimal grid points and ties with denominator $scale, strategy $strategy',
    ({ scale, strategy }) => {
      // The oracle works on small integer numerators, independently of the
      // evaluator's decimal decomposition and BigInt arithmetic.
      const units = { '': 'number', '%': 'percentage', deg: 'angle' }
      for (const [unit, expectedUnit] of Object.entries(units)) {
        for (let step = 1; step <= 10; step++) {
          for (let numerator = -50; numerator <= 50; numerator++) {
            const quotient = numerator / step
            const multiples = {
              nearest: Math.floor((2 * numerator + step) / (2 * step)),
              up: Math.ceil(quotient),
              down: Math.floor(quotient),
              'to-zero': Math.trunc(quotient),
            }
            const multiple = multiples[strategy]
            const expected =
              multiple === 0 && numerator < 0 ? -0 : (multiple * step) / scale
            for (const sign of [1, -1]) {
              const source = `round(${strategy}, ${numerator / scale}${unit}, ${(sign * step) / scale}${unit})`
              expect({
                source,
                result: evaluateColorCalc(source, CHANNELS),
              }).toStrictEqual({
                source,
                result: { value: expected, unit: expectedUnit },
              })
            }
          }
        }
      }
    },
  )

  it('keeps modulo and remainder signs and open divisor endpoints', () => {
    // Dyadic fractions are exactly representable, so these assertions need
    // no tolerance that could hide an excluded endpoint or a signed zero.
    for (let numerator = -64; numerator <= 64; numerator++) {
      for (let divisor = -16; divisor <= 16; divisor++) {
        if (divisor === 0) {
          continue
        }
        const remainder = numerator % divisor
        const modulo = ((remainder + divisor) % divisor) / 8
        const zero = divisor < 0 ? -0 : 0
        const expectedModulo = modulo === 0 ? zero : modulo
        for (const unit of ['', '%', 'deg']) {
          expect(
            evaluateColorCalc(
              `mod(${numerator / 8}${unit}, ${divisor / 8}${unit})`,
              CHANNELS,
            )?.value,
          ).toBe(expectedModulo)
          expect(
            evaluateColorCalc(
              `rem(${numerator / 8}${unit}, ${divisor / 8}${unit})`,
              CHANNELS,
            )?.value,
          ).toBe(remainder / 8)
        }
      }
    }
  })

  it.each([
    ['round(up, calc(.1 + .2), .1)', 0.4],
    ['round(down, calc(.1 + .2), .1)', 0.3],
    ['round(up, .3, .1)', 0.3],
    ['round(5e-324, 5e-324)', 5e-324],
    ['round(down, 1.7976931348623157e308, 1e308)', 1e308],
    ['round(up, -5e-324, 1e308)', -0],
    ['min(-0, 0)', -0],
    ['max(-0, 0)', 0],
    ['round(1turn, 100grad)', 360],
    ['round(3.141592653589793rad, 90deg)', 180],
  ])(
    'preserves the evaluated finite-number contract in %s',
    (source, expected) => {
      expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(expected)
    },
  )

  it.each([
    'round(up, 1.7976931348623157e308, 1e308)',
    'min(0, round(up, 1.7976931348623157e308, 1e308))',
    'round(1, 5e-324)',
    'mod(-5e-324, 1e308)',
    'round(1%, 1deg)',
    'rem(1deg, 1)',
    'calc(1e308turn / 1e308)',
  ])('rejects unrepresentable or incompatible %s', source => {
    expect(evaluateColorCalc(source, CHANNELS)).toBeNull()
  })

  it('shares resource limits across stepped and comparison nesting', () => {
    const source = `${'round(min('.repeat(16)}1${', 2), 1)'.repeat(16)}`
    expect(evaluateColorCalc(source, CHANNELS)?.value).toBe(1)
    expect(evaluateColorCalc(`calc(${source})`, CHANNELS)).toBeNull()
    const tokens = `round(1, min(${Array.from({ length: 124 }, () => '1').join(',')}))`
    expect(evaluateColorCalc(tokens, CHANNELS)?.value).toBe(1)
    expect(evaluateColorCalc(tokens.replace('))', ',1))'), CHANNELS)).toBeNull()
  })
})
