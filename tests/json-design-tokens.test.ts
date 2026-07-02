import { describe, expect, it } from 'vitest'
import { findJsonDesignTokens } from '../src/strategies/json-design-tokens'

describe(findJsonDesignTokens, () => {
  it('highlights a value hex color in token-values mode', () => {
    const text = '{ "value": "#0ea5e9" }'
    const result = findJsonDesignTokens(text)

    expect(result).toStrictEqual([
      {
        start: text.indexOf('#0ea5e9'),
        end: text.indexOf('#0ea5e9') + 7,
        color: 'rgb(14, 165, 233)',
      },
    ])
    expect(text.slice(result[0].start, result[0].end)).toBe('#0ea5e9')
  })

  it('honors ARGB mode for 8-digit hex token values', () => {
    const text = '{ "value": "#80ff0000" }'
    const result = findJsonDesignTokens(text, {
      languageId: 'json',
      designTokenJsonMode: 'token-values',
      useARGB: true,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('#80ff0000'),
        end: text.indexOf('#80ff0000') + 9,
        color: 'rgba(255, 0, 0, 0.502)',
      },
    ])
  })

  it('highlights a $value CSS Color 4 function in token-values mode', () => {
    const text = '{ "$value": "color(display-p3 1 0 0)" }'
    const color = 'color(display-p3 1 0 0)'
    const result = findJsonDesignTokens(text)

    expect(result).toStrictEqual([
      {
        start: text.indexOf(color),
        end: text.indexOf(color) + color.length,
        color: 'rgb(255, 0, 0)',
      },
    ])
    expect(text.slice(result[0].start, result[0].end)).toBe(color)
  })

  it('does not match non-token properties in token-values mode', () => {
    const result = findJsonDesignTokens('{ "brand": "#0ea5e9" }')

    expect(result).toStrictEqual([])
  })

  it('does not match strings inside array token values in token-values mode', () => {
    const result = findJsonDesignTokens('{ "value": ["#fff"] }')

    expect(result).toStrictEqual([])
  })

  it('does not match strings inside nested object token values in token-values mode', () => {
    const result = findJsonDesignTokens('{ "value": { "nested": "#fff" } }')

    expect(result).toStrictEqual([])
  })

  it('does not carry value through non-string primitive token values', () => {
    const result = findJsonDesignTokens('{ "value": true, "label": "#fff" }')

    expect(result).toStrictEqual([])
  })

  it('does not carry value through malformed primitive fragments', () => {
    const result = findJsonDesignTokens('{ "value": true "#fff" }')

    expect(result).toStrictEqual([])
  })

  it('does not carry value through duplicate colon fragments', () => {
    const result = findJsonDesignTokens('{ "value": : "#fff" }')

    expect(result).toStrictEqual([])
  })

  it('highlights non-token string values in strings mode', () => {
    const text = '{ "brand": "#0ea5e9" }'
    const result = findJsonDesignTokens(text, {
      languageId: 'json',
      designTokenJsonMode: 'strings',
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('#0ea5e9'),
        end: text.indexOf('#0ea5e9') + 7,
        color: 'rgb(14, 165, 233)',
      },
    ])
    expect(text.slice(result[0].start, result[0].end)).toBe('#0ea5e9')
  })

  it('highlights strings inside arrays and objects in strings mode', () => {
    const text = '{ "items": ["#fff"], "nested": { "color": "#000" } }'
    const result = findJsonDesignTokens(text, {
      languageId: 'json',
      designTokenJsonMode: 'strings',
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('#fff'),
        end: text.indexOf('#fff') + 4,
        color: 'rgb(255, 255, 255)',
      },
      {
        start: text.indexOf('#000'),
        end: text.indexOf('#000') + 4,
        color: 'rgb(0, 0, 0)',
      },
    ])
  })

  it('does not duplicate token-value matches in all mode', () => {
    const text = '{ "value": "red" }'
    const result = findJsonDesignTokens(text, {
      languageId: 'json',
      designTokenJsonMode: 'all',
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('red'),
        end: text.indexOf('red') + 3,
        color: 'rgb(255, 0, 0)',
      },
    ])
  })

  it('does not match colors in off mode', () => {
    const result = findJsonDesignTokens('{ "value": "#0ea5e9" }', {
      languageId: 'json',
      designTokenJsonMode: 'off',
    })

    expect(result).toStrictEqual([])
  })

  it('never highlights property keys', () => {
    const result = findJsonDesignTokens('{ "#ff0000": "label" }', {
      languageId: 'json',
      designTokenJsonMode: 'all',
    })

    expect(result).toStrictEqual([])
  })

  it('ignores JSONC line and block comments', () => {
    const text = [
      '// "value": "#ff0000"',
      '{ "value": "#0ea5e9" }',
      '/* "$value": "red" */',
    ].join('\n')
    const result = findJsonDesignTokens(text)

    expect(result).toStrictEqual([
      {
        start: text.indexOf('#0ea5e9'),
        end: text.indexOf('#0ea5e9') + 7,
        color: 'rgb(14, 165, 233)',
      },
    ])
  })

  it('resolves escaped string contents while highlighting source contents', () => {
    const text = String.raw`{ "value": "\u0023ff0000" }`
    const sourceValue = String.raw`\u0023ff0000`
    const result = findJsonDesignTokens(text)

    expect(result).toStrictEqual([
      {
        start: text.indexOf(sourceValue),
        end: text.indexOf(sourceValue) + sourceValue.length,
        color: 'rgb(255, 0, 0)',
      },
    ])
    expect(text.slice(result[0].start, result[0].end)).toBe(sourceValue)
  })

  it('does not throw on malformed input', () => {
    expect(() => findJsonDesignTokens('{ "value": "#ff0000"')).not.toThrow()
  })
})
