import { describe, expect, it } from 'vitest'
import {
  formatColorForSourceWithAlphaDelta,
  resolveColorSourceKind,
} from '../../../src/engine/presentation/source-color'
import {
  findSwiftColors,
  parseSwiftColor,
} from '../../../src/engine/strategies/swift-colors'

describe('swift static colors', () => {
  it.each([
    ['Color(red: 1, green: 0, blue: 0)', 'rgb(255, 0, 0)'],
    [
      'SwiftUI.Color(.sRGB, red: 1, green: 0, blue: 0, opacity: 0.5)',
      'rgba(255, 0, 0, 0.5)',
    ],
    [
      'Color(.sRGBLinear, red: 0.5, green: 0.5, blue: 0.5)',
      'rgb(188, 188, 188)',
    ],
    ['Color(.displayP3, red: 1, green: 0, blue: 0)', 'rgb(255, 0, 0)'],
    ['Color(white: 0.5)', 'rgb(128, 128, 128)'],
    ['Color(hue: 0.5, saturation: 1, brightness: 1)', 'rgb(0, 255, 255)'],
    ['UIColor(red: 1, green: 0, blue: 0, alpha: 0.5)', 'rgba(255, 0, 0, 0.5)'],
    ['UIKit.UIColor(white: 0.5, alpha: 1)', 'rgb(128, 128, 128)'],
    ['UIColor(displayP3Red: 1, green: 0, blue: 0, alpha: 1)', 'rgb(255, 0, 0)'],
    [
      'UIColor(hue: 0.5, saturation: 1, brightness: 1, alpha: 1)',
      'rgb(0, 255, 255)',
    ],
  ])('resolves %s', (source, color) => {
    expect(findSwiftColors(source)).toStrictEqual([
      {
        start: 0,
        end: source.length,
        color,
        editMode: 'source',
        sourceKind: 'swift-color',
      },
    ])
    expect(
      resolveColorSourceKind({ languageId: 'swift', sourceText: source }),
    ).toBe('swift-color')
  })

  it.each([
    'Color("AccentColor")',
    'Color(.red)',
    'UIColor(dynamicProvider: { _ in .red })',
    'UIColor(red: 1, green: 0, blue: 0)',
    'Color(red: 255, green: 0, blue: 0)',
    'Color(red: value, green: 0, blue: 0)',
    'Color(blue: 0, red: 1, green: 0)',
    'Color(red = 1, green = 0, blue = 0)',
    'Color(red: 1f, green: 0f, blue: 0f)',
    'Color(.unknown, red: 1, green: 0, blue: 0)',
    'Color(.sRGB, hue: 0, saturation: 1, brightness: 1)',
    'Custom.Color(red: 1, green: 0, blue: 0)',
  ])('rejects %s', source => expect(findSwiftColors(source)).toStrictEqual([]))

  it('scopes detection to Swift', () =>
    expect(
      findSwiftColors('Color(red: 1, green: 0, blue: 0)', {
        languageId: 'typescript',
      }),
    ).toStrictEqual([]))

  it.each([
    'Color(red: 1, green: 0, blue: 0)',
    'Color(.displayP3, red: 1, green: 0, blue: 0)',
    'Color(.sRGBLinear, white: 0.5)',
    'Color(hue: 0, saturation: 1, brightness: 1)',
    'UIColor(white: 0.5, alpha: 1)',
    'UIColor(displayP3Red: 1, green: 0, blue: 0, alpha: 1)',
  ])('round-trips %s after picker edits', source => {
    const replacement =
      parseSwiftColor(source)?.format({ r: 64, g: 128, b: 192, a: 0.5 }) ?? ''
    const roundTrip = parseSwiftColor(replacement)?.color
    expect(roundTrip?.r).toBeCloseTo(64, 2)
    expect(roundTrip?.g).toBeCloseTo(128, 2)
    expect(roundTrip?.b).toBeCloseTo(192, 2)
    expect(roundTrip?.a).toBe(0.5)
  })

  it('adds opacity without losing source comments', () =>
    expect(
      formatColorForSourceWithAlphaDelta(
        -0.25,
        'Color(red: 1, /* brand */ green: 0, blue: 0)',
        'swift-color',
      ),
    ).toBe('Color(red: 1, /* brand */ green: 0, blue: 0, opacity: 0.75)'))
})
