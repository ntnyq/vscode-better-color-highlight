/**
 * WCAG 2.0 contrast calculation.
 * Determines whether white or black text provides better contrast against a given background color.
 */

/** 256-entry sRGB to linear lookup table for performance */
const srgb8ToLinear = new Float64Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  srgb8ToLinear[i] = c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/**
 * Calculate the relative luminance of an sRGB color per WCAG 2.0.
 * @param r Red [0, 255]
 * @param g Green [0, 255]
 * @param b Blue [0, 255]
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * srgb8ToLinear[r] +
    0.7152 * srgb8ToLinear[g] +
    0.0722 * srgb8ToLinear[b]
  )
}

/**
 * Calculate the contrast ratio between two relative luminance values.
 */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (0.05 + lighter) / (0.05 + darker)
}

const WHITE_LUMINANCE = relativeLuminance(255, 255, 255) // ~1.0
const BLACK_LUMINANCE = relativeLuminance(0, 0, 0) // ~0.0

/**
 * Get the best contrast text color (white or black) for a given background color.
 * Uses WCAG 2.0 relative luminance and contrast ratio calculations.
 *
 * @param r Red [0, 255]
 * @param g Green [0, 255]
 * @param b Blue [0, 255]
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
