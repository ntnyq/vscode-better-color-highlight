import { describe, expect, it } from 'vitest'
import {
  formatColorForSource,
  formatColorForSourceWithAlphaDelta,
} from '../../../src/engine/presentation/source-color'
import {
  parseAndroidColor,
  findAndroidColors,
} from '../../../src/engine/strategies/android-colors'

/**
 * Pad a valid Compose call with a retained comment to exercise output limits.
 */
function createPaddedComposeCall(length: number, alpha = ''): string {
  const head = `Color(1f,0f,0f,${alpha}colorSpace=ColorSpaces.DisplayP3/*`
  const tail = '*/)'
  return head + 'a'.repeat(length - head.length - tail.length) + tail
}

describe.each(['Srgb', 'LinearSrgb', 'DisplayP3'])(
  'compose %s boundaries',
  space => {
    it.each(['Color', 'Color.hsl', 'Color.hsv'])(
      'round-trips picker colors near the cube corners and neutral axis: %s',
      method => {
        const channels = [0, 1e-9, 0.01, 1, 16, 64, 128, 254, 255 - 1e-9, 255]
        const source =
          method === 'Color'
            ? `Color(.21f, .43f, .65f, colorSpace = ColorSpaces.${space})`
            : `${method}(217f, .63f, .47f, colorSpace = ColorSpaces.${space})`
        let maximumError = 0
        for (const r of channels) {
          for (const g of channels) {
            for (const b of channels) {
              const next = { r, g, b, a: 0.5 }
              const replacement = formatColorForSource(
                next,
                source,
                'android-color',
              )
              const parsed = parseAndroidColor(replacement ?? '')?.color
              expect(parsed).toBeDefined()
              for (const channel of ['r', 'g', 'b'] as const) {
                const error = Math.abs(
                  (parsed?.[channel] ?? Infinity) - next[channel],
                )
                maximumError = Math.max(maximumError, error)
              }
            }
          }
        }
        expect(maximumError).toBeLessThan(0.01)
      },
    )

    it('preserves exact source tokens on no-op and alpha-only picker callbacks', () => {
      const source = `Color(1.0000000F,0.000000001f,0F,alpha=.123456789F,colorSpace=ColorSpaces.${space})`
      expect(
        formatColorForSource(
          { r: 255, g: 0, b: 0, a: 0.123 },
          source,
          'android-color',
        ),
      ).toBe(source)
      const replacement = formatColorForSource(
        { r: 255, g: 0, b: 0, a: 0.5 },
        source,
        'android-color',
      )
      expect(replacement).toBe(source.replace('.123456789F', '0.5F'))
      expect(parseAndroidColor(replacement ?? '')?.color.a).toBe(0.5)
    })

    it.each([0, 1])(
      'preserves source text when an alpha command clamps at %s',
      alpha => {
        const source = `Color(1.0000000F,0f,0f,alpha=${alpha}.0000000F,colorSpace=ColorSpaces.${space})`
        expect(
          formatColorForSourceWithAlphaDelta(
            alpha ? 0.1 : -0.1,
            source,
            'android-color',
          ),
        ).toBe(source)
      },
    )
  },
)

describe('compose picker preview identity', () => {
  it('allows normalization noise but does not swallow a fractional RGB edit', () => {
    const source =
      'Color(0.2100000F,0.010000001f,0f,colorSpace=ColorSpaces.Srgb)'
    const preview = findAndroidColors(source)[0].color
    expect(preview).toBe('rgb(54, 3, 0)')
    expect(
      formatColorForSource(
        { r: (54 / 255) * 255, g: (3 / 255) * 255, b: 0, a: 0.5 },
        source,
        'android-color',
      ),
    ).toBe(source.replace('ColorSpaces.Srgb', 'ColorSpaces.Srgb, alpha = 0.5f'))
    const replacement = formatColorForSource(
      { r: 54.0001, g: 3, b: 0, a: 0.5 },
      source,
      'android-color',
    )
    expect(replacement).not.toContain('0.2100000F')
    expect(parseAndroidColor(replacement ?? '')?.color.r).toBeCloseTo(
      54.0001,
      3,
    )
  })
})

describe('compose bounded source edits', () => {
  it.each([4089, 4096])(
    'rejects alpha insertion that would exceed the limit from %s characters',
    length => {
      const source = createPaddedComposeCall(length)
      expect(parseAndroidColor(source)).not.toBeNull()
      expect(
        formatColorForSourceWithAlphaDelta(-0.1, source, 'android-color'),
      ).toBeNull()
      expect(
        formatColorForSource(
          { r: 255, g: 0, b: 0, a: 0.5 },
          source,
          'android-color',
        ),
      ).toBeNull()
      expect(
        formatColorForSource(
          { r: 0, g: 255, b: 0, a: 1 },
          source,
          'android-color',
        ),
      ).toBeNull()
    },
  )

  it('rejects expansion of an existing alpha argument beyond the limit', () => {
    const source = createPaddedComposeCall(4096, 'alpha=1F,')
    expect(parseAndroidColor(source)).not.toBeNull()
    expect(
      formatColorForSourceWithAlphaDelta(-0.1, source, 'android-color'),
    ).toBeNull()
  })

  it('accepts an exact-limit replacement and no-op edits at the limit', () => {
    const source = createPaddedComposeCall(4096 - ', alpha = 0.9f'.length)
    const replacement = formatColorForSourceWithAlphaDelta(
      -0.1,
      source,
      'android-color',
    )
    expect(replacement?.length).toBe(4096)
    expect(parseAndroidColor(replacement ?? '')?.color.a).toBe(0.9)
    const atLimit = createPaddedComposeCall(4096)
    expect(
      formatColorForSource(
        { r: 255, g: 0, b: 0, a: 1 },
        atLimit,
        'android-color',
      ),
    ).toBe(atLimit)
  })
})

describe.each(['\n', '\r\n'])('compose nested comments (%j)', newline => {
  it('ignores fake parameters and closing parentheses inside nested comments', () => {
    const source = `Color(1f,0f,0f, /* outer /* inner */${newline}alpha=.3f, colorSpace=ColorSpaces.DisplayP3) */ )`
    const matches = findAndroidColors(source)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      start: 0,
      end: source.length,
      color: 'rgb(255, 0, 0)',
    })
    const replacement = formatColorForSourceWithAlphaDelta(
      -0.1,
      source,
      'android-color',
    )
    expect(replacement).toBe(source.replace('0f, /*', '0f, 0.9f, /*'))
    expect(parseAndroidColor(replacement ?? '')?.color.a).toBe(0.9)
  })

  it('preserves nested comments while editing actual explicit-space arguments', () => {
    const source = `Color(1f,0f,0f, /* outer /* inner */${newline}alpha=.3f, colorSpace=ColorSpaces.Srgb) */ colorSpace=ColorSpaces.DisplayP3)`
    const replacement = formatColorForSource(
      { r: 0, g: 0, b: 0, a: 0.5 },
      source,
      'android-color',
    )
    expect(replacement).toBe(
      source
        .replace('Color(1f,0f,0f,', 'Color(0f,0f,0f,')
        .replace(
          'ColorSpaces.DisplayP3)',
          'ColorSpaces.DisplayP3, alpha = 0.5f)',
        ),
    )
    expect(parseAndroidColor(replacement ?? '')?.color.a).toBe(0.5)
    const unclosed = `Color(1f,0f,0f, /* outer /* inner */${newline}alpha=.3f, colorSpace=ColorSpaces.DisplayP3)`
    expect(findAndroidColors(unclosed)).toStrictEqual([])
    expect(parseAndroidColor(unclosed)).toBeNull()
  })
})
