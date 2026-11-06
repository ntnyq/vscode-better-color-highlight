import { describe, expect, it } from 'vitest'
import { createCssMathContextChecker } from '../../../../src/engine/strategies/shared/css-math-context'

describe(createCssMathContextChecker, () => {
  it.each([
    'hypot(inside)',
    'rgb(hypot((inside)) 0 0)',
    'atan2(inside, 1)',
    'calc(min(inside, 10))',
    'HYpOt(inside)',
    'hypot(/* ) ; { */ inside)',
    'hypot(")" + inside)',
    "hypot('\\\')' + inside)",
    'hypot(/* inside */ 1)',
    'hypot("inside")',
  ])('recognizes math operands in %s', source => {
    const text = `${source}; outside`
    const isInMath = createCssMathContextChecker(text)
    expect(isInMath(text.indexOf('inside'))).toBe(true)
    expect(isInMath(text.indexOf('outside'))).toBe(false)
  })

  it.each([';', '{', '}'])(
    'recovers from an unclosed calculation at %s',
    boundary => {
      const text = `hypot(((inside ${boundary} outside`
      const isInMath = createCssMathContextChecker(text)
      expect(isInMath(text.indexOf('inside'))).toBe(true)
      expect(isInMath(text.indexOf('outside'))).toBe(false)
    },
  )

  it.each([
    'hypot (inside)',
    'my-hypot(inside)',
    'reallylonghypot(inside)',
    '_hypot(inside)',
    'atan20(inside)',
    'unknown(inside)',
  ])('leaves other source contexts unchanged: %s', text => {
    expect(createCssMathContextChecker(text)(text.indexOf('inside'))).toBe(
      false,
    )
  })

  it('keeps multiline arguments inside a calculation', () => {
    const text = 'hypot(\n inside\n) outside'
    const isInMath = createCssMathContextChecker(text)
    expect(isInMath(text.indexOf('inside'))).toBe(true)
    expect(isInMath(text.indexOf('outside'))).toBe(false)
  })

  it('bounds recovery work for deep and repeated source', () => {
    const prefix = `${'hypot('.repeat(10_000)}inside; `
    const text = prefix + 'hypot(inside); outside; '.repeat(1000)
    const isInMath = createCssMathContextChecker(text)
    for (const match of text.matchAll(/inside|outside/gu)) {
      expect(isInMath(match.index)).toBe(match[0] === 'inside')
    }
  })
})
