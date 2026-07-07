/**
 * Display and copy-ready color strings derived from a resolved rgb()/rgba().
 */
export interface ColorPresentations {
  /**
   * Alpha channel displayed as a percentage.
   */
  readonly alpha: string

  /**
   * Hex representation, including alpha when transparent.
   */
  readonly hex: string

  /**
   * CSS HSL representation.
   */
  readonly hsl: string

  /**
   * CSS OKLCH representation.
   */
  readonly oklch: string

  /**
   * CSS RGB or RGBA representation.
   */
  readonly rgb: string
}

/**
 * Color presentation formats available for copy and replacement commands.
 */
export type ColorPresentationFormat = 'hex' | 'hsl' | 'oklch' | 'rgb'

/**
 * Numeric RGBA channels normalized for formatting.
 */
export interface RgbaColor {
  /**
   * Red channel in the 0-255 range.
   */
  readonly r: number

  /**
   * Green channel in the 0-255 range.
   */
  readonly g: number

  /**
   * Blue channel in the 0-255 range.
   */
  readonly b: number

  /**
   * Alpha channel in the 0-1 range.
   */
  readonly a: number
}

/**
 * Build common color presentations for hover text and copy commands.
 *
 * @param color - Resolved rgb()/rgba() color string.
 * @returns Formatted color presentations, or null for unsupported input.
 */
export function getColorPresentations(
  color: string,
): ColorPresentations | null {
  const rgba = parseResolvedColor(color)
  if (!rgba) {
    return null
  }

  return getColorPresentationsFromRgba(rgba)
}

/**
 * Build common color presentations from numeric RGBA channel values.
 *
 * @param color - Numeric RGBA channel values.
 * @returns Formatted color presentations.
 */
export function getColorPresentationsFromRgba(
  color: RgbaColor,
): ColorPresentations {
  return {
    alpha: formatAlpha(color.a),
    hex: formatHex(color),
    hsl: formatHsl(color),
    oklch: formatOklch(color),
    rgb: formatRgb(color),
  }
}

/**
 * Return a copy of a color with alpha clamped to the valid 0-1 range.
 *
 * @param color - Original RGBA color.
 * @param alpha - Next alpha channel.
 * @returns RGBA color with the new alpha.
 */
export function withAlpha(color: RgbaColor, alpha: number): RgbaColor {
  return {
    ...color,
    a: clamp(alpha, 0, 1),
  }
}

/**
 * Select one formatted value from a color presentation set.
 *
 * @param presentations - Available color presentation strings.
 * @param format - Requested presentation format.
 * @returns The formatted color value for the requested format.
 */
export function formatColorPresentation(
  presentations: ColorPresentations,
  format: ColorPresentationFormat,
): string {
  return presentations[format]
}

/**
 * Parse an rgb()/rgba() string emitted by detector strategies.
 *
 * @param color - Resolved color string.
 * @returns Numeric RGBA channels, or null when parsing fails.
 */
export function parseResolvedColor(color: string): RgbaColor | null {
  const match = color.match(
    /^rgba?\(\s*(?<red>\d+)\s*,\s*(?<green>\d+)\s*,\s*(?<blue>\d+)(?:\s*,\s*(?<alpha>[\d.]+))?\s*\)$/u,
  )
  if (!match?.groups) {
    return null
  }

  return {
    r: clamp(Number.parseInt(match.groups.red), 0, 255),
    g: clamp(Number.parseInt(match.groups.green), 0, 255),
    b: clamp(Number.parseInt(match.groups.blue), 0, 255),
    a: clamp(Number(match.groups.alpha ?? '1'), 0, 1),
  }
}

/**
 * Clamp a numeric value to an inclusive range.
 *
 * @param value - Value to clamp.
 * @param min - Minimum allowed value.
 * @param max - Maximum allowed value.
 * @returns Clamped value.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Format an alpha channel as a compact percentage.
 *
 * @param alpha - Alpha channel in the 0-1 range.
 * @returns Percentage alpha text.
 */
function formatAlpha(alpha: number): string {
  return `${formatNumber(alpha * 100, 1)}%`
}

/**
 * Format RGBA channels as a hex color.
 *
 * @param color - RGBA channel values.
 * @returns Hex color string, including alpha when alpha is below 1.
 */
function formatHex({ a, b, g, r }: RgbaColor): string {
  const alpha = a < 1 ? toHexByte(a * 255) : ''
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}${alpha}`
}

/**
 * Format a channel as a two-digit hexadecimal byte.
 *
 * @param value - Channel value to round and format.
 * @returns Two-digit lowercase hex byte.
 */
function toHexByte(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0')
}

/**
 * Format RGBA channels as CSS rgb() or rgba().
 *
 * @param color - RGBA channel values.
 * @returns CSS rgb() or rgba() string.
 */
function formatRgb({ a, b, g, r }: RgbaColor): string {
  if (a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${formatNumber(a, 3)})`
  }
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Format RGBA channels as modern CSS hsl() syntax.
 *
 * @param color - RGBA channel values.
 * @returns CSS hsl() string, including slash alpha when transparent.
 */
function formatHsl(color: RgbaColor): string {
  const { h, l, s } = rgbToHsl(color)
  const base = `hsl(${formatNumber(h, 1)} ${formatNumber(s * 100, 1)}% ${formatNumber(l * 100, 1)}%`
  return color.a < 1 ? `${base} / ${formatNumber(color.a, 3)})` : `${base})`
}

/**
 * Convert RGB channels to HSL components.
 *
 * @param color - RGBA color; alpha is ignored for conversion.
 * @returns HSL components with hue in degrees and saturation/lightness in 0-1.
 */
function rgbToHsl({ b, g, r }: RgbaColor): {
  h: number
  s: number
  l: number
} {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const l = (max + min) / 2

  if (max === min) {
    return { h: 0, s: 0, l }
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number

  switch (max) {
    case red: {
      h = (green - blue) / d + (green < blue ? 6 : 0)
      break
    }
    case green: {
      h = (blue - red) / d + 2
      break
    }
    default: {
      h = (red - green) / d + 4
      break
    }
  }

  return { h: h * 60, s, l }
}

/**
 * Format RGBA channels as modern CSS oklch() syntax.
 *
 * @param color - RGBA channel values.
 * @returns CSS oklch() string, including slash alpha when transparent.
 */
function formatOklch(color: RgbaColor): string {
  const { c, h, l } = rgbToOklch(color)
  const base = `oklch(${formatNumber(l * 100, 1)}% ${formatNumber(c, 3)} ${formatNumber(h, 1)}`
  return color.a < 1 ? `${base} / ${formatNumber(color.a, 3)})` : `${base})`
}

/**
 * Convert RGB channels to OKLCH components.
 *
 * @param color - RGBA color; alpha is ignored for conversion.
 * @returns OKLCH components with lightness/chroma in OKLab space and hue in degrees.
 */
function rgbToOklch({ b, g, r }: RgbaColor): {
  l: number
  c: number
  h: number
} {
  const red = srgbToLinear(r / 255)
  const green = srgbToLinear(g / 255)
  const blue = srgbToLinear(b / 255)

  const lmsL = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
  )
  const lmsM = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
  )
  const lmsS = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  )

  const l = 0.2104542553 * lmsL + 0.793617785 * lmsM - 0.0040720468 * lmsS
  const a = 1.9779984951 * lmsL - 2.428592205 * lmsM + 0.4505937099 * lmsS
  const bAxis = 0.0259040371 * lmsL + 0.7827717662 * lmsM - 0.808675766 * lmsS
  const c = Math.hypot(a, bAxis)
  const h = normalizeHue((Math.atan2(bAxis, a) * 180) / Math.PI)

  return { l, c, h }
}

/**
 * Convert a gamma-corrected sRGB component to linear light.
 *
 * @param value - sRGB channel normalized to 0-1.
 * @returns Linear-light channel value.
 */
function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/**
 * Normalize a hue angle to the [0, 360) range.
 *
 * @param value - Hue angle in degrees.
 * @returns Normalized hue angle.
 */
function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360
}

/**
 * Format a number with fixed precision and trim insignificant zeroes.
 *
 * @param value - Numeric value to format.
 * @param fractionDigits - Maximum number of fractional digits.
 * @returns Compact decimal string.
 */
function formatNumber(value: number, fractionDigits: number): string {
  return Number(value.toFixed(fractionDigits)).toString()
}
