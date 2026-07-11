import { describe, expect, it } from 'vitest'
import { evaluateColorContrast } from '../src/contrast/evaluate'
import type { RgbaColor } from '../src/utils/color/presentation'

const black = { r: 0, g: 0, b: 0, a: 1 } as const
const white = { r: 255, g: 255, b: 255, a: 1 } as const

function grayForRatio(ratio: number): RgbaColor {
  const linear = 0.05 * (ratio - 1)
  const srgb =
    linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055
  const channel = srgb * 255
  return { r: channel, g: channel, b: channel, a: 1 }
}

describe(evaluateColorContrast, () => {
  it('returns 21:1 for black and white', () => {
    expect(evaluateColorContrast(black, white)).toStrictEqual({
      aaaLargeText: true,
      aaaNormalText: true,
      aaLargeText: true,
      aaNormalText: true,
      effectiveForeground: black,
      kind: 'determinate',
      ratio: 21,
    })
  })

  it('returns 1:1 for equal colors', () => {
    expect(evaluateColorContrast(white, white)).toMatchObject({
      aaaLargeText: false,
      aaaNormalText: false,
      aaLargeText: false,
      aaNormalText: false,
      kind: 'determinate',
      ratio: 1,
    })
  })

  // These grayscale channel pairs produce exact IEEE-754 ratios after the
  // independent WCAG luminance calculation, so strict `>` comparisons fail.
  it.each([
    [
      3,
      89.4335215077196,
      1,
      {
        aaaLargeText: false,
        aaaNormalText: false,
        aaLargeText: true,
        aaNormalText: false,
      },
    ],
    [
      4.5,
      117.37036844336754,
      3,
      {
        aaaLargeText: true,
        aaaNormalText: false,
        aaLargeText: true,
        aaNormalText: true,
      },
    ],
    [
      7,
      151.25624277823107,
      5,
      {
        aaaLargeText: true,
        aaaNormalText: true,
        aaLargeText: true,
        aaNormalText: true,
      },
    ],
  ] as const)(
    'passes conformance levels at the %s:1 threshold',
    (ratio, foregroundChannel, backgroundChannel, flags) => {
      const foreground = {
        r: foregroundChannel,
        g: foregroundChannel,
        b: foregroundChannel,
        a: 1,
      }
      const background = {
        r: backgroundChannel,
        g: backgroundChannel,
        b: backgroundChannel,
        a: 1,
      }

      expect(evaluateColorContrast(foreground, background)).toMatchObject({
        ...flags,
        kind: 'determinate',
        ratio,
      })
    },
  )

  it('uses the unrounded ratio for pass and fail decisions', () => {
    const evaluation = evaluateColorContrast(grayForRatio(4.499), black)

    expect(evaluation).toMatchObject({
      aaaLargeText: false,
      aaLargeText: true,
      aaNormalText: false,
      kind: 'determinate',
      ratio: expect.closeTo(4.499, 12),
    })
  })

  it('composites a translucent foreground over an opaque background in sRGB', () => {
    expect(
      evaluateColorContrast({ r: 255, g: 255, b: 255, a: 0.5 }, black),
    ).toMatchObject({
      effectiveForeground: { r: 127.5, g: 127.5, b: 127.5, a: 1 },
      kind: 'determinate',
    })
  })

  it('keeps an opaque foreground unchanged', () => {
    const foreground = { r: 12.5, g: 34.5, b: 56.5, a: 1 }

    expect(evaluateColorContrast(foreground, white)).toMatchObject({
      effectiveForeground: foreground,
      kind: 'determinate',
    })
  })

  it('returns an indeterminate result for a translucent background', () => {
    expect(
      evaluateColorContrast(black, { r: 255, g: 255, b: 255, a: 0.5 }),
    ).toStrictEqual({
      kind: 'indeterminate',
      reason: 'translucent-background',
    })
  })

  it('clamps RGBA inputs before evaluating contrast', () => {
    expect(
      evaluateColorContrast(
        { r: -10, g: -20, b: -30, a: 2 },
        { r: 300, g: 280, b: 260, a: 4 },
      ),
    ).toStrictEqual({
      aaaLargeText: true,
      aaaNormalText: true,
      aaLargeText: true,
      aaNormalText: true,
      effectiveForeground: black,
      kind: 'determinate',
      ratio: 21,
    })
  })
})
