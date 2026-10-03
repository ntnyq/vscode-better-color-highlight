import { describe, expect, it } from 'vitest'
import {
  formatColorForSourceWithAlphaDelta,
  resolveColorSourceKind,
} from '../../../src/engine/presentation/source-color'
import {
  findAndroidColors,
  parseAndroidColor,
} from '../../../src/engine/strategies/android-colors'
import { findColorFunctions } from '../../../src/engine/strategies/color-functions'

describe('android static colors', () => {
  it.each([
    ['Color(255, 0, 0)', 'rgb(255, 0, 0)'],
    ['Color(255, 0, 0, 128)', 'rgba(255, 0, 0, 0.502)'],
    ['Color(1f, 0f, 0f, .5f)', 'rgba(255, 0, 0, 0.5)'],
    ['Color(blue = 0, red = 255, green = 0)', 'rgb(255, 0, 0)'],
    [
      'Color(red = 1f, green = 0f, blue = 0f, alpha = 0.5f,)',
      'rgba(255, 0, 0, 0.5)',
    ],
    ['androidx.compose.ui.graphics.Color(255, 0, 0)', 'rgb(255, 0, 0)'],
    ['Color.hsl(120f, 1f, .5f)', 'rgb(0, 255, 0)'],
    [
      'Color.hsv(hue = 240f, saturation = 1f, value = 1f, alpha = .5f)',
      'rgba(0, 0, 255, 0.5)',
    ],
    ['Color.rgb(255, 0, 0)', 'rgb(255, 0, 0)'],
    ['Color.argb(128, 255, 0, 0)', 'rgba(255, 0, 0, 0.502)'],
    ['android.graphics.Color.argb(.5f, 1f, 0f, 0f)', 'rgba(255, 0, 0, 0.5)'],
    ['Color.parseColor("#80FF0000")', 'rgba(255, 0, 0, 0.502)'],
    ['Color.parseColor("#ff0000")', 'rgb(255, 0, 0)'],
    ['Color(255, /* ) */ 0, // ignored )\n 0)', 'rgb(255, 0, 0)'],
  ])('resolves the whole %s expression', (source, expected) => {
    expect(findAndroidColors(`val c = ${source}`)).toStrictEqual([
      {
        start: 8,
        end: 8 + source.length,
        color: expected,
        editMode: 'source',
        sourceKind: 'android-color',
      },
    ])
    expect(
      resolveColorSourceKind({ languageId: 'kotlin', sourceText: source }),
    ).toBe('android-color')
  })

  it.each([
    'Color(1, 0f, 0f)',
    'Color(1.0, 0.0, 0.0)',
    'Color(256, 0, 0)',
    'Color(-1, 0, 0)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.DisplayP3)',
    'Color(red, 0, 0)',
    'Color(red = 1f, red = 0f, blue = 0f)',
    'Color(red = 1f, 0f, 0f)',
    'Color(1 + 2, 0, 0)',
    'Color.hsl(0f, 100f, 50f)',
    'Color.hsv(0f, 1f, 2f)',
    'Color.rgb(1, 0, 0, 0)',
    'Color.argb(1, 2, 3)',
    'Color.parseColor("#f00")',
    'Color.parseColor("#80ff0000" + suffix)',
    'Color.parseColor("$brand")',
    'Color(red: 1, green: 0, blue: 0)',
    'android.graphics.Color(255, 0, 0)',
    'androidx.compose.ui.graphics.Color.rgb(255, 0, 0)',
    'Color(255,,0,0)',
  ])('rejects ambiguous or invalid %s', source =>
    expect(findAndroidColors(source)).toStrictEqual([]),
  )

  it('enforces language and receiver boundaries', () => {
    expect(
      findAndroidColors('Color(255, 0, 0)', { languageId: 'java' }),
    ).toStrictEqual([])
    expect(
      findAndroidColors('Color.rgb(255, 0, 0)', { languageId: 'java' }),
    ).toHaveLength(1)
    expect(
      findAndroidColors('Color(255, 0, 0)', { languageId: 'typescript' }),
    ).toStrictEqual([])
    expect(findAndroidColors('my.Color(255, 0, 0)')).toStrictEqual([])
    expect(
      findColorFunctions('Color.rgb(1f, 0f, 0f) Color.hsl(0, 100%, 50%)'),
    ).toStrictEqual([])
  })

  it('bounds malformed calls and continues scanning later valid calls', () => {
    expect(findAndroidColors('Color(/*'.repeat(1000))).toStrictEqual([])
    const source = `Color(${' '.repeat(5000)}255, 0, 0); Color(255, 0, 0)`
    expect(findAndroidColors(source)).toHaveLength(1)
    expect(findAndroidColors(source)[0].start).toBe(
      source.lastIndexOf('Color('),
    )
  })

  it.each([
    'Color(255, 0, 0)',
    'Color(1f, 0f, 0f)',
    'Color.hsl(0f, 1f, .5f)',
    'Color.hsv(0f, 1f, 1f)',
    'Color.rgb(255, 0, 0)',
    'Color.argb(255, 255, 0, 0)',
    'Color.parseColor("#ff0000")',
  ])('round-trips source-preserving edits for %s', source => {
    const parsed = parseAndroidColor(source)
    const next = { r: 0, g: 128, b: 255, a: 0.4 }
    const replacement = parsed?.format(next) ?? ''
    const roundTrip = parseAndroidColor(replacement)?.color
    expect(roundTrip?.r).toBeCloseTo(next.r, 2)
    expect(roundTrip?.g).toBeCloseTo(next.g, 2)
    expect(roundTrip?.b).toBeCloseTo(next.b, 2)
    expect(roundTrip?.a).toBeCloseTo(next.a, 2)
  })

  it('preserves comments, named argument order, and float suffixes', () => {
    const commented = 'Color(1f, 0f, 0f // note: original\n)'
    const replacement =
      parseAndroidColor(commented)?.format({ r: 255, g: 0, b: 0, a: 0.5 }) ?? ''
    expect(replacement).toBe('Color(1f, 0f, 0f, 0.5f // note: original\n)')
    expect(parseAndroidColor(replacement)?.color.a).toBe(0.5)
    expect(
      formatColorForSourceWithAlphaDelta(
        -0.5,
        'Color(blue = 0F, /* note */ red = 1F, green = 0F)',
        'android-color',
      ),
    ).toBe('Color(blue = 0F, /* note */ red = 1F, green = 0F, alpha = 0.5f)')
    expect(
      formatColorForSourceWithAlphaDelta(
        -0.5,
        'Color( 0xFFFF0000UL )',
        'compose-argb-hex',
      ),
    ).toBe('Color( 0x80FF0000UL )')
  })
})
