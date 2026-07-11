import type { RgbaColor } from './presentation'

/**
 * WCAG 2.0 contrast calculation.
 * Determines whether white or black text provides better contrast against a given background color.
 */

/**
 * 256-entry sRGB to linear lookup table for performance.
 */
const srgb8ToLinear = new Float64Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  srgb8ToLinear[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/**
 * Calculate the relative luminance of an sRGB color per WCAG 2.0.
 * @param r - Red channel [0, 255]
 * @param g - Green channel [0, 255]
 * @param b - Blue channel [0, 255]
 * @returns The relative luminance value in [0, 1]
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  )
}

/**
 * Composite an RGBA foreground over an RGBA background in sRGB.
 *
 * @param foreground - Foreground RGBA channels.
 * @param background - Background RGBA channels.
 * @returns The clamped source-over composite color.
 */
export function compositeRgba(
  foreground: RgbaColor,
  background: RgbaColor,
): RgbaColor {
  const source = clampRgba(foreground)
  const backdrop = clampRgba(background)
  const a = source.a + backdrop.a * (1 - source.a)

  if (a === 0) {
    return { r: 0, g: 0, b: 0, a: 0 }
  }

  return {
    r: compositeChannel(source.r, backdrop.r, source.a, backdrop.a, a),
    g: compositeChannel(source.g, backdrop.g, source.a, backdrop.a, a),
    b: compositeChannel(source.b, backdrop.b, source.a, backdrop.a, a),
    a,
  }
}

/**
 * Calculate the contrast ratio between two relative luminance values.
 * @param l1 - First luminance value
 * @param l2 - Second luminance value
 * @returns The contrast ratio (1 = no contrast, 21 = maximum contrast)
 */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (0.05 + lighter) / (0.05 + darker)
}

/**
 * Relative luminance for white.
 */
const WHITE_LUMINANCE = relativeLuminance(255, 255, 255)

/**
 * Relative luminance for black.
 */
const BLACK_LUMINANCE = relativeLuminance(0, 0, 0)

/**
 * Get the best contrast text color (white or black) for a given background color.
 * Uses WCAG 2.0 relative luminance and contrast ratio calculations.
 * @param r - Red channel [0, 255]
 * @param g - Green channel [0, 255]
 * @param b - Blue channel [0, 255]
 * @returns '#FFFFFF' or '#000000'
 */
export function getContrastColor(
  r: number,
  g: number,
  b: number,
): '#FFFFFF' | '#000000' {
  const bgLuminance = relativeLuminance(r, g, b)
  const whiteContrast = contrastRatio(WHITE_LUMINANCE, bgLuminance)
  const blackContrast = contrastRatio(bgLuminance, BLACK_LUMINANCE)
  return whiteContrast >= blackContrast ? '#FFFFFF' : '#000000'
}

function channelToLinear(channel: number): number {
  const clamped = clamp(channel, 0, 255)
  if (Number.isInteger(clamped)) {
    return srgb8ToLinear[clamped]
  }

  const srgb = clamped / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function compositeChannel(
  foreground: number,
  background: number,
  foregroundAlpha: number,
  backgroundAlpha: number,
  alpha: number,
): number {
  return (
    (foreground * foregroundAlpha +
      background * backgroundAlpha * (1 - foregroundAlpha)) /
    alpha
  )
}

function clampRgba({ a, b, g, r }: RgbaColor): RgbaColor {
  return {
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(b, 0, 255),
    a: clamp(a, 0, 1),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
