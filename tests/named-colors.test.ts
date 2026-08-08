import { describe, expect, it } from 'vitest'
import { findNamedColors } from '../src/engine/strategies/named-colors'

describe(findNamedColors, () => {
  it('finds named color "red"', () => {
    const result = findNamedColors('color: red;')
    expect(result).toStrictEqual([
      { start: 7, end: 10, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('finds a named color at the start of the string', () => {
    const result = findNamedColors('red')
    expect(result).toStrictEqual([
      { start: 0, end: 3, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('finds named color "rebeccapurple"', () => {
    const result = findNamedColors('color: rebeccapurple;')
    expect(result).toStrictEqual([
      { start: 7, end: 20, color: 'rgb(102, 51, 153)' },
    ])
  })

  it('skips colors preceded by $ (SCSS variable)', () => {
    const result = findNamedColors('$red: #ff0000;')
    expect(result).toStrictEqual([])
  })

  it('skips colors preceded by @ (Less variable)', () => {
    const result = findNamedColors('@red: #ff0000;')
    expect(result).toStrictEqual([])
  })

  it('skips colors preceded by - (hyphenated)', () => {
    const result = findNamedColors('dark-red')
    expect(result).toStrictEqual([])
  })

  it('finds multiple named colors', () => {
    const result = findNamedColors('color: red; bg: blue;')
    expect(result).toHaveLength(2)
  })

  it('skips selector names in CSS-like languages', () => {
    const result = findNamedColors('.red { color: blue; }', {
      languageId: 'css',
    })

    expect(result).toStrictEqual([
      { start: 14, end: 18, color: 'rgb(0, 0, 255)' },
    ])
  })

  it('skips selector names in Stylus files', () => {
    const text = '.red\n  color red'
    const result = findNamedColors(text, {
      languageId: 'stylus',
    })

    expect(result).toStrictEqual([
      { start: 13, end: 16, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('keeps CSS syntax filtering when named color mode is always', () => {
    const result = findNamedColors('.red { color: blue; }\n@layer red;', {
      languageId: 'css',
      namedColorMatchMode: 'always',
    })

    expect(result).toStrictEqual([
      { start: 14, end: 18, color: 'rgb(0, 0, 255)' },
    ])
  })

  it('allows standalone CSS named values when named color mode is always', () => {
    const result = findNamedColors('red', {
      languageId: 'css',
      namedColorMatchMode: 'always',
    })

    expect(result).toStrictEqual([
      { start: 0, end: 3, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('skips named colors in CSS at-rules', () => {
    const result = findNamedColors('@layer red;', {
      languageId: 'css',
    })

    expect(result).toStrictEqual([])
  })

  it('skips named colors in CSS at-rule conditions', () => {
    const result = findNamedColors('@supports (color: red) { .item {} }', {
      languageId: 'css',
    })

    expect(result).toStrictEqual([])
  })

  it('skips named colors in CSS custom property names', () => {
    const result = findNamedColors(':root { --red: #f00; color: red; }', {
      languageId: 'css',
    })

    expect(result).toStrictEqual([
      { start: 28, end: 31, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('keeps explicit word matching permissive without a CSS-like context', () => {
    const result = findNamedColors('const color = "red"')

    expect(result).toStrictEqual([
      { start: 15, end: 18, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('defers Flutter Material members to the Dart color strategy', () => {
    expect(
      findNamedColors('final color = Colors.red;', {
        languageId: 'dart',
        namedColorMatchMode: 'always',
      }),
    ).toStrictEqual([])
  })

  it('skips normalized Dart color component names', () => {
    expect(
      findNamedColors(
        `final color = Color.from(
          alpha: 1,
          red: 0.2,
          green: 0.3,
          blue: 0.4,
          colorSpace: ColorSpace.displayP3,
        );`,
        {
          languageId: 'dart',
          namedColorMatchMode: 'always',
        },
      ),
    ).toStrictEqual([])
  })

  it(
    'skips many Dart component names without repeated constructor scans',
    { timeout: 500 },
    () => {
      const text =
        'Color.from(alpha: 1, red: 0.1, green: 0.2, blue: 0.3);\n'.repeat(1600)

      expect(
        findNamedColors(text, {
          languageId: 'dart',
          namedColorMatchMode: 'always',
        }),
      ).toStrictEqual([])
    },
  )
})
