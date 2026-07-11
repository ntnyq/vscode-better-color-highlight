import { describe, expect, it } from 'vitest'
import {
  compositeRgba,
  relativeLuminance,
  contrastRatio,
  getContrastColor,
} from '../src/utils/color'

describe(relativeLuminance, () => {
  it('returns ~1.0 for white', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 2)
  })

  it('returns ~0.0 for black', () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 2)
  })

  it('returns a value between 0 and 1 for gray', () => {
    const l = relativeLuminance(128, 128, 128)
    expect(l).toBeGreaterThan(0)
    expect(l).toBeLessThan(1)
  })

  it('supports fractional channels with the sRGB transfer function', () => {
    expect(relativeLuminance(127.5, 127.5, 127.5)).toBeCloseTo(
      0.21404114048223255,
      14,
    )
  })

  it('clamps channels to the sRGB range', () => {
    expect(relativeLuminance(-1, 300, 255)).toBeCloseTo(
      relativeLuminance(0, 255, 255),
      14,
    )
  })
})

describe(compositeRgba, () => {
  it('composites clamped foreground channels over an opaque background', () => {
    expect(
      compositeRgba(
        { r: 300, g: -10, b: 100, a: 0.25 },
        { r: 0, g: 100, b: 300, a: 1 },
      ),
    ).toStrictEqual({ r: 63.75, g: 75, b: 216.25, a: 1 })
  })
})

describe(contrastRatio, () => {
  it('returns 1 for identical luminance', () => {
    expect(contrastRatio(0.5, 0.5)).toBe(1)
  })

  it('returns high contrast for black vs white', () => {
    expect(contrastRatio(1, 0)).toBe(21)
  })
})

describe(getContrastColor, () => {
  it('returns white for black background', () => {
    expect(getContrastColor(0, 0, 0)).toBe('#FFFFFF')
  })

  it('returns black for white background', () => {
    expect(getContrastColor(255, 255, 255)).toBe('#000000')
  })

  it('returns appropriate contrast for dark colors', () => {
    expect(getContrastColor(0, 0, 255)).toBe('#FFFFFF')
  })

  it('returns appropriate contrast for light colors', () => {
    expect(getContrastColor(255, 255, 0)).toBe('#000000')
  })
})
