import { describe, expect, it } from 'vitest'
import {
  parseStaticCall,
  scanStaticCalls,
} from '../../../../src/engine/strategies/shared/static-call'

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

describe('static call comment boundaries', () => {
  it('shares nested-comment boundaries between scanning and argument spans', () => {
    const source = 'Color(1f, /* outer /* inner */ false=2f, ) */ 0f, 0f)'
    expect(
      scanStaticCalls(source, /Color\(/gu, { nestedBlockComments: true }),
    ).toStrictEqual([{ source, start: 0, end: source.length }])
    const call = parseStaticCall(source, { nestedBlockComments: true })
    expect(call?.args.map(arg => arg.value)).toStrictEqual(['1f', '0f', '0f'])
    for (const arg of call?.args ?? []) {
      expect(source.slice(arg.start, arg.end)).toBe(arg.value)
    }
  })

  it('retains non-nested comment semantics by default', () => {
    const source = 'Color(1,/* outer /* inner */2,3)'
    expect(parseStaticCall(source)?.args.map(arg => arg.value)).toStrictEqual([
      '1',
      '2',
      '3',
    ])
    expect(scanStaticCalls(source, /Color\(/gu)).toHaveLength(1)
    expect(parseStaticCall(source, { nestedBlockComments: true })).toBeNull()
    expect(
      scanStaticCalls(source, /Color\(/gu, { nestedBlockComments: true }),
    ).toStrictEqual([])
  })

  it.each([
    'Color("https://example.test/a/*literal*/")',
    'Color("/*not a comment*/")',
  ])('preserves comment-like text in quoted literals: %s', source => {
    expect(parseStaticCall(source)?.args[0].value).toBe(source.slice(6, -1))
  })

  it.each([
    'Color(1,2,3 //)',
    'Color(1,2,3 /*)',
    'Color(1,/* outer /* inner */2,3)',
  ])('rejects calls closed only inside comments: %s', source => {
    expect(parseStaticCall(source, { nestedBlockComments: true })).toBeNull()
  })

  it('bounds nested comments and continues to a later valid call', () => {
    const valid = 'Color(1f,0f,0f)'
    const text = `Color(1f, /*${'/*'.repeat(2500)}${'*/'.repeat(2500)}*/0f,0f); ${valid}`
    const matches = scanStaticCalls(text, /Color\(/gu, {
      nestedBlockComments: true,
    })
    expect(matches).toStrictEqual([
      { source: valid, start: text.lastIndexOf(valid), end: text.length },
    ])
  })
})
