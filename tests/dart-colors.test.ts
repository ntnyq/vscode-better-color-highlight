import { describe, expect, it } from 'vitest'
import { findDartColors } from '../src/engine/strategies/dart-colors'

describe(findDartColors, () => {
  it('resolves Color(0xAARRGGBB) as ARGB', () => {
    const text = 'static const primary = Color(0xffB11016);'

    expect(findDartColors(text)).toStrictEqual([
      {
        start: text.indexOf('Color('),
        end: text.indexOf(';'),
        color: 'rgb(177, 16, 22)',
      },
    ])
  })

  it('resolves Color.fromARGB(alpha, red, green, blue)', () => {
    const text = 'final color = Color.fromARGB(128, 57, 197, 187);'

    expect(findDartColors(text)).toStrictEqual([
      {
        start: text.indexOf('Color.fromARGB'),
        end: text.indexOf(';'),
        color: 'rgba(57, 197, 187, 0.502)',
      },
    ])
  })

  it('resolves constructors containing nested Dart comments', () => {
    const text = 'Color.fromARGB(128, /* outer /* inner */ gap */ 57, 197, 187)'

    expect(findDartColors(text)).toStrictEqual([
      {
        start: 0,
        end: text.length,
        color: 'rgba(57, 197, 187, 0.502)',
      },
    ])
  })

  it.each([
    '// Example: Color(0xffB11016)',
    "const sample = 'Color(0xffB11016)';",
  ])('resolves Dart constructors in comments and strings: %s', text => {
    const start = text.indexOf('Color(')

    expect(findDartColors(text)).toStrictEqual([
      {
        start,
        end: start + 'Color(0xffB11016)'.length,
        color: 'rgb(177, 16, 22)',
      },
    ])
  })

  it('resolves multiline Color.fromRGBO with a trailing comma', () => {
    const text = `final color = Color.fromRGBO(
  57,
  197,
  187,
  0.5,
);`

    expect(findDartColors(text)).toStrictEqual([
      {
        start: text.indexOf('Color.fromRGBO'),
        end: text.indexOf(';'),
        color: 'rgba(57, 197, 187, 0.5)',
      },
    ])
  })

  it('resolves Color.from named channels in any order', () => {
    const text = `final color = Color.from(
  blue: 0.5,
  alpha: 0.25,
  red: 1,
  colorSpace: ColorSpace.sRGB,
  green: 0,
);`

    expect(findDartColors(text)).toStrictEqual([
      {
        start: text.indexOf('Color.from('),
        end: text.indexOf(';'),
        color: 'rgba(255, 0, 128, 0.25)',
      },
    ])
  })

  it.each([
    ['Colors.deepPurple', 'rgb(103, 58, 183)'],
    ['Colors.deepPurpleAccent', 'rgb(124, 77, 255)'],
    ['Colors.lightBlueAccent', 'rgb(64, 196, 255)'],
    ['Colors.black54', 'rgba(0, 0, 0, 0.541)'],
    ['Colors.transparent', 'rgba(0, 0, 0, 0)'],
  ])('resolves the Flutter Material color %s', (text, color) => {
    expect(findDartColors(text)).toStrictEqual([
      {
        start: 0,
        end: text.length,
        color,
        editMode: 'read-only',
      },
    ])
  })

  it.each([
    ['Color.fromARGB(255, 255, 255, 255)', 'rgb(255, 255, 255)'],
    ['Color.fromRGBO(0, 0, 0, 1)', 'rgb(0, 0, 0)'],
    ['Color.fromRGBO(1, 2, 3, 0)', 'rgba(1, 2, 3, 0)'],
  ])('accepts inclusive channel bounds in %s', (text, color) => {
    expect(findDartColors(text)).toStrictEqual([
      { start: 0, end: text.length, color },
    ])
  })

  it.each([
    'Color.fromARGB(256, 57, 197, 187)',
    'Color.fromARGB(2/* gap */55, 0, 0, 0)',
    'Color.fromRGBO(256, 197, 187, 0.5)',
    'Color.fromRGBO(57, 197, 187, 1.5)',
    'Color.from(alpha: alpha, red: 1, green: 0, blue: 0)',
    'Color.from(alpha: 1, red: 1, green: 0, blue: 0, colorSpace: ColorSpace.displayP3)',
    'Colors.deepPurple.shade700',
    'Colors.deepPurple /* gap */ .shade700',
    'Colors.blue[400]',
    'Colors.blue // gap\n[400]',
    'colors.deepPurple',
    'material.Colors.deepPurple',
  ])('ignores unsupported or non-static Dart color source %s', text => {
    expect(findDartColors(text)).toStrictEqual([])
  })

  it(
    'handles incomplete constructor-heavy documents without blocking',
    { timeout: 500 },
    () => {
      expect(findDartColors('Color('.repeat(12_000))).toStrictEqual([])
    },
  )
})
