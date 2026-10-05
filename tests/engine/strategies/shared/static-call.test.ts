import { describe, expect, it } from 'vitest'
import { scanStaticCalls } from '../../../../src/engine/strategies/shared/static-call'

describe(scanStaticCalls, () => {
  it('retains complete nested calls by default and when nesting is explicit', () => {
    const source = 'Color(factory(")"), /* ) */ 1)'
    const expected = [{ source, start: 0, end: source.length }]
    expect(scanStaticCalls(source, /Color\(/gu)).toStrictEqual(expected)
    expect(
      scanStaticCalls(source, /Color\(/gu, { allowNesting: true }),
    ).toStrictEqual(expected)
  })

  it('rejects nested calls and recovers later matches when nesting is disabled', () => {
    const valid = 'Color(1, 0, 0)'
    const text = `Color(factory(1), 0, 0); ${valid}`
    expect(
      scanStaticCalls(text, /Color\(/gu, { allowNesting: false }),
    ).toStrictEqual([
      { source: valid, start: text.indexOf(valid), end: text.length },
    ])
  })

  it('ignores parentheses in quoted strings and comments for flat calls', () => {
    const source = `Color("(", '(', /* ( */ 1, // (\n2)`
    expect(
      scanStaticCalls(source, /Color\(/gu, { allowNesting: false }),
    ).toStrictEqual([{ source, start: 0, end: source.length }])
  })

  it('preserves escaped quote handling for flat calls', () => {
    const source = String.raw`Color("escaped \" (", 1)`
    expect(
      scanStaticCalls(source, /Color\(/gu, { allowNesting: false }),
    ).toStrictEqual([{ source, start: 0, end: source.length }])
  })
})
