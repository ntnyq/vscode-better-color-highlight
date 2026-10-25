import { describe, expect, it } from 'vitest'
import {
  formatColorForSource,
  formatColorForSourceWithAlphaDelta,
  resolveColorSourceKind,
} from '../../../src/engine/presentation/source-color'
import {
  findAndroidColors,
  parseAndroidColor,
} from '../../../src/engine/strategies/android-colors'

const SPACES = ['Srgb', 'LinearSrgb', 'DisplayP3'] as const
const QUALIFIERS = ['', 'androidx.compose.ui.graphics.colorspace.'] as const

describe('compose explicit static RGB spaces', () => {
  it.each([
    [
      'Color(.5f, .5f, .5f, colorSpace = ColorSpaces.Srgb)',
      'rgb(128, 128, 128)',
    ],
    [
      'Color(.5f, .5f, .5f, colorSpace = ColorSpaces.LinearSrgb)',
      'rgb(188, 188, 188)',
    ],
    [
      'Color(.5f, .2f, .1f, colorSpace = ColorSpaces.DisplayP3)',
      'rgb(138, 44, 13)',
    ],
    [
      'Color.hsl(15f, .6666666667f, .3f, colorSpace = ColorSpaces.DisplayP3)',
      'rgb(138, 44, 13)',
    ],
    [
      'Color.hsv(15f, .8f, .5f, colorSpace = ColorSpaces.DisplayP3)',
      'rgb(138, 44, 13)',
    ],
    [
      'Color.hsl(0f, 0f, .5f, colorSpace = ColorSpaces.LinearSrgb)',
      'rgb(188, 188, 188)',
    ],
    [
      'Color.hsv(0f, 0f, .5f, colorSpace = ColorSpaces.LinearSrgb)',
      'rgb(188, 188, 188)',
    ],
    ['Color(1f, 0f, 0f, .5f, ColorSpaces.DisplayP3)', 'rgba(255, 0, 0, 0.5)'],
  ])('previews converted sRGB channels for %s', (source, expected) => {
    const prefix = '// 🎨\r\nval brand = '
    expect(
      findAndroidColors(prefix + source, { languageId: 'kotlin' }),
    ).toStrictEqual([
      {
        start: prefix.length,
        end: prefix.length + source.length,
        color: expected,
        editMode: 'source',
        sourceKind: 'android-color',
      },
    ])
    expect(
      resolveColorSourceKind({ sourceText: source, languageId: 'kotlin' }),
    ).toBe('android-color')
  })

  describe.each(SPACES)('space %s', space => {
    describe.each(QUALIFIERS)('qualifier %j', qualifier => {
      const spaceSource = `${qualifier}ColorSpaces.${space}`

      it.each([
        `Color(.2f, .4f, .6f, .7f, ${spaceSource})`,
        `androidx.compose.ui.graphics.Color(.2f, .4f, .6f, colorSpace = ${spaceSource})`,
        `Color(colorSpace = ${spaceSource}, blue = .6F, red = .2F, green = .4F,)`,
        `Color.hsl(210f, .5f, .4f, colorSpace = ${spaceSource})`,
        `Color.hsv(value = .6f, colorSpace = ${spaceSource}, saturation = .5f, hue = 210f)`,
      ])('round-trips picker edits in the original space: %s', source => {
        const parsed = parseAndroidColor(source)
        expect(parsed).not.toBeNull()
        // Non-primary channels catch conversions that confuse source and sRGB.
        for (const next of [
          { r: 23, g: 127, b: 231, a: 0.4 },
          { r: 0, g: 255, b: 0, a: 1 },
          { r: 0, g: 0, b: 0, a: 0 },
          { r: 255, g: 255, b: 255, a: 1 },
        ]) {
          const replacement = formatColorForSource(
            next,
            source,
            'android-color',
          )
          expect(replacement).toContain(spaceSource)
          const roundTrip = parseAndroidColor(replacement ?? '')?.color
          expect(roundTrip).toBeDefined()
          expect(roundTrip?.r).toBeCloseTo(next.r, 2)
          expect(roundTrip?.g).toBeCloseTo(next.g, 2)
          expect(roundTrip?.b).toBeCloseTo(next.b, 2)
          expect(roundTrip?.a).toBeCloseTo(next.a, 6)
        }
      })
    })
  })

  it.each([
    'Color(255, 0, 0, colorSpace = ColorSpaces.Srgb)',
    'Color(1f, 0, 0f, colorSpace = ColorSpaces.Srgb)',
    'Color(1.0, 0.0, 0.0, colorSpace = ColorSpaces.Srgb)',
    'Color(1f, 0f, 0f, ColorSpaces.Srgb)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.Srgb, alpha = 1)',
    'Color(1.01f, 0f, 0f, colorSpace = ColorSpaces.DisplayP3)',
    'Color(-.1f, 0f, 0f, colorSpace = ColorSpaces.LinearSrgb)',
    'Color(1e999f, 0f, 0f, colorSpace = ColorSpaces.Srgb)',
    'Color(1f, 0f, 0f, alpha = 1.1f, colorSpace = ColorSpaces.Srgb)',
    'Color.hsl(361f, 1f, .5f, colorSpace = ColorSpaces.Srgb)',
    'Color.hsv(0f, -1f, 1f, colorSpace = ColorSpaces.Srgb)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.Srgb, colorSpace = ColorSpaces.Srgb)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.Srgb, .5f)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.Srgb, unknown = 1f)',
    'Color(1f, 0f, 0f, colorSpace: ColorSpaces.Srgb)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.sRGB)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.DciP3)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.ExtendedSrgb)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.LinearExtendedSrgb)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.AdobeRgb)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.Bt2020)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.CieLab)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.CieXyz)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.Bt2020Hlg)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.Bt2020Pq)',
    'Color(1f, 0f, 0f, colorSpace = customSpace)',
    'Color(1f, 0f, 0f, colorSpace = Spaces.DisplayP3)',
    'Color(1f, 0f, 0f, colorSpace = other.ColorSpaces.DisplayP3)',
    'Color(1f, 0f, 0f, colorSpace = ColorSpaces.DisplayP3.copy())',
    'Color(1f, 0f, 0f, colorSpace = getSpace())',
    'Color.rgb(1f, 0f, 0f, colorSpace = ColorSpaces.Srgb)',
    'Color.argb(1f, 1f, 0f, 0f, colorSpace = ColorSpaces.Srgb)',
    'android.graphics.Color(1f, 0f, 0f, colorSpace = ColorSpaces.Srgb)',
    'my.Color(1f, 0f, 0f, colorSpace = ColorSpaces.Srgb)',
  ])('skips unsupported or ambiguous syntax: %s', source => {
    expect(findAndroidColors(source)).toStrictEqual([])
    expect(parseAndroidColor(source)).toBeNull()
    expect(
      formatColorForSourceWithAlphaDelta(-0.1, source, 'android-color'),
    ).toBeNull()
  })

  it.each(['java', 'swift', 'typescript', 'plaintext'])(
    'requires Kotlin: %s',
    languageId => {
      const source = 'Color(1f, 0f, 0f, colorSpace = ColorSpaces.DisplayP3)'
      expect(findAndroidColors(source, { languageId })).toStrictEqual([])
      expect(parseAndroidColor(source, languageId)).toBeNull()
      expect(
        resolveColorSourceKind({ sourceText: source, languageId }),
      ).toBeUndefined()
    },
  )

  it.each(['\n', '\r\n'])(
    'preserves wide-gamut source channels when editing alpha (%j)',
    newline => {
      const source = `Color(blue = 0.010000001F, /* ) */ red = 1.0000000F,${newline}green = 0.020000001F, colorSpace = ColorSpaces.DisplayP3, // keep${newline})`
      const expected = source.replace(
        'ColorSpaces.DisplayP3,',
        'ColorSpaces.DisplayP3, alpha = 0.9f,',
      )
      const replacement = formatColorForSourceWithAlphaDelta(
        -0.1,
        source,
        'android-color',
      )
      expect(replacement).toBe(expected)
      expect(parseAndroidColor(source)?.color.g).toBeLessThan(0)
      expect(parseAndroidColor(replacement ?? '')?.color.a).toBe(0.9)
    },
  )

  it.each([
    [
      'Color(1.0000000f, 0f, 0f, 1.0F, ColorSpaces.DisplayP3)',
      'Color(1.0000000f, 0f, 0f, 0.9F, ColorSpaces.DisplayP3)',
    ],
    [
      'Color.hsl(360.000000f, 1.000000F, .500000f, colorSpace = ColorSpaces.LinearSrgb)',
      'Color.hsl(360.000000f, 1.000000F, .500000f, colorSpace = ColorSpaces.LinearSrgb, alpha = 0.9f)',
    ],
    [
      'Color.hsv(colorSpace = ColorSpaces.Srgb, alpha = 0.05F, hue = 0F, saturation = 1F, value = 1F)',
      'Color.hsv(colorSpace = ColorSpaces.Srgb, alpha = 0F, hue = 0F, saturation = 1F, value = 1F)',
    ],
  ])('only rewrites alpha: %s', (source, expected) => {
    expect(
      formatColorForSourceWithAlphaDelta(-0.1, source, 'android-color'),
    ).toBe(expected)
  })

  it('preserves comments and the space argument while picking a new color', () => {
    const source =
      'Color(/* red */ 1F, 0f, 0F, colorSpace = ColorSpaces.LinearSrgb // space\n)'
    const replacement = formatColorForSource(
      { r: 128, g: 128, b: 128, a: 0.5 },
      source,
      'android-color',
    )
    expect(replacement).toBe(
      'Color(/* red */ 0.215861F, 0.21586f, 0.21586F, colorSpace = ColorSpaces.LinearSrgb, alpha = 0.5f // space\n)',
    )
  })

  it('keeps the bounded scanner and recovers after an unsupported call', () => {
    const valid = 'Color(1f, 0f, 0f, colorSpace = ColorSpaces.Srgb)'
    const source = `Color(${' '.repeat(4096)}1f, 0f, 0f, colorSpace = ColorSpaces.DisplayP3) ${valid}`
    const matches = findAndroidColors(source)
    expect(matches).toHaveLength(1)
    expect(matches[0].start).toBe(source.lastIndexOf(valid))
  })
})
