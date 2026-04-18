/**
 * Pure color conversion utilities.
 * No external dependencies. All functions clamp values to valid ranges.
 */

/**
 * Clamp a value between min and max.
 * @param value - The value to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns The clamped value
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Parse a percentage value string (e.g. "50%") to a number.
 * @param value - The string to parse
 * @returns The parsed number (50% -> 0.5)
 */
function parsePercent(value: string): number {
  return value.endsWith('%')
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value)
}

/**
 * Convert degrees to radians.
 * @param deg - Angle in degrees
 * @returns Angle in radians
 */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Parse a hex color string to RGB values.
 * Supports #RGB, #RRGGBB, #RRGGBBAA (RGBA mode), and 0x prefix.
 * @param hex - The hex color string to parse
 * @returns An object with r, g, b (and optional a) values, or null if invalid
 */
export function hexToRgb(
  hex: string,
): { r: number; g: number; b: number; a?: number } | null {
  const clean = hex.replace(/^(?:#|0x)/i, '')

  let r: number
  let g: number
  let b: number
  let a: number | undefined

  switch (clean.length) {
    case 3: {
      r = Number.parseInt(`${clean[0]}${clean[0]}`, 16)
      g = Number.parseInt(`${clean[1]}${clean[1]}`, 16)
      b = Number.parseInt(`${clean[2]}${clean[2]}`, 16)
      break
    }
    case 4: {
      r = Number.parseInt(`${clean[0]}${clean[0]}`, 16)
      g = Number.parseInt(`${clean[1]}${clean[1]}`, 16)
      b = Number.parseInt(`${clean[2]}${clean[2]}`, 16)
      a = Number.parseInt(`${clean[3]}${clean[3]}`, 16) / 255
      break
    }
    case 6: {
      r = Number.parseInt(clean.slice(0, 2), 16)
      g = Number.parseInt(clean.slice(2, 4), 16)
      b = Number.parseInt(clean.slice(4, 6), 16)
      break
    }
    case 8: {
      r = Number.parseInt(clean.slice(0, 2), 16)
      g = Number.parseInt(clean.slice(2, 4), 16)
      b = Number.parseInt(clean.slice(4, 6), 16)
      a = Number.parseInt(clean.slice(6, 8), 16) / 255
      break
    }
    default: {
      return null
    }
  }

  return {
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(b, 0, 255),
    ...(a !== undefined ? { a: clamp(a, 0, 1) } : {}),
  }
}

/**
 * Parse a hex color string in ARGB mode.
 * For 8-digit hex: first 2 digits = alpha, last 6 = RGB.
 * For 4-digit hex: first digit = alpha, last 3 = RGB.
 * Falls back to hexToRgb for non-alpha hex strings.
 * @param hex - The hex color string to parse
 * @returns An object with r, g, b (and optional a) values, or null if invalid
 */
export function hexARGBToRgb(
  hex: string,
): { r: number; g: number; b: number; a?: number } | null {
  const clean = hex.replace(/^(?:#|0x)/i, '')

  if (clean.length === 4) {
    const a = Number.parseInt(`${clean[0]}${clean[0]}`, 16) / 255
    const r = Number.parseInt(`${clean[1]}${clean[1]}`, 16)
    const g = Number.parseInt(`${clean[2]}${clean[2]}`, 16)
    const b = Number.parseInt(`${clean[3]}${clean[3]}`, 16)
    return {
      r: clamp(r, 0, 255),
      g: clamp(g, 0, 255),
      b: clamp(b, 0, 255),
      a: clamp(a, 0, 1),
    }
  }

  if (clean.length === 8) {
    const a = Number.parseInt(clean.slice(0, 2), 16) / 255
    const r = Number.parseInt(clean.slice(2, 4), 16)
    const g = Number.parseInt(clean.slice(4, 6), 16)
    const b = Number.parseInt(clean.slice(6, 8), 16)
    return {
      r: clamp(r, 0, 255),
      g: clamp(g, 0, 255),
      b: clamp(b, 0, 255),
      a: clamp(a, 0, 1),
    }
  }

  return hexToRgb(hex)
}

/**
 * Helper function for HSL to RGB conversion.
 * @param p - Temporary value based on lightness and saturation
 * @param q - Temporary value based on lightness and saturation
 * @param t - Temporary hue value (hue / 360 + offset)
 * @returns RGB component value in [0, 1]
 */
function hue2rgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) {
    tt += 1
  }
  if (tt > 1) {
    tt -= 1
  }
  if (tt < 1 / 6) {
    return p + (q - p) * 6 * tt
  }
  if (tt < 1 / 2) {
    return q
  }
  if (tt < 2 / 3) {
    return p + (q - p) * (2 / 3 - tt) * 6
  }
  return p
}

/**
 * Convert HSL to RGB.
 * @param h - Hue in degrees [0, 360]
 * @param s - Saturation [0, 1]
 * @param l - Lightness [0, 1]
 * @returns Tuple of [r, g, b] in [0, 255]
 */
export function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  h = ((h % 360) + 360) % 360
  s = clamp(s, 0, 1)
  l = clamp(l, 0, 1)

  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return [
    Math.round(hue2rgb(p, q, h / 360 + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h / 360) * 255),
    Math.round(hue2rgb(p, q, h / 360 - 1 / 3) * 255),
  ]
}

/**
 * Convert HWB to RGB.
 * @param h - Hue in degrees [0, 360]
 * @param w - Whiteness [0, 1]
 * @param b - Blackness [0, 1]
 * @returns Tuple of [r, g, b] in [0, 255]
 */
export function hwbToRgb(
  h: number,
  w: number,
  b: number,
): [number, number, number] {
  h = ((h % 360) + 360) % 360
  w = clamp(w, 0, 1)
  b = clamp(b, 0, 1)

  // If whiteness + blackness >= 1, result is a shade of gray
  if (w + b >= 1) {
    const gray = Math.round((w / (w + b)) * 255)
    return [gray, gray, gray]
  }

  const [r, g, bl] = hslToRgb(h, 1, 0.5)

  function scale(x: number): number {
    return Math.round((x / 255) * (1 - w - b) * 255 + w * 255)
  }

  return [scale(r), scale(g), scale(bl)]
}

// --- CIE Lab / OKLab conversions ---

/**
 * Convert a linear sRGB value to gamma-corrected sRGB (delinearization).
 * @param c - Linear sRGB value
 * @returns Gamma-corrected sRGB value
 */
function linearToSrgb(c: number): number {
  return c <= 0.003_130_8 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

/** D65 white point constants */
const D65_XN = 0.950_489
const D65_YN = 1
const D65_ZN = 1.088_84

/**
 * Lab forward transform function.
 * @param t - Input value
 * @returns Transformed value
 */
function labF(t: number): number {
  const delta = 6 / 29
  return t > delta ** 3 ? t ** (1 / 3) : t / (3 * delta * delta) + 4 / 29
}

/**
 * Lab inverse transform function.
 * @param t - Input value
 * @returns Inverse-transformed value
 */
function labFInv(t: number): number {
  const delta = 6 / 29
  return t > delta ? t ** 3 : 3 * delta * delta * (t - 4 / 29)
}

/**
 * Convert CIE Lab to RGB.
 * @param L - Lightness [0, 100]
 * @param a - Green-red axis
 * @param b - Blue-yellow axis
 * @returns Tuple of [r, g, b] in [0, 255]
 */
export function labToRgb(
  L: number,
  a: number,
  b: number,
): [number, number, number] {
  L = clamp(L, 0, 100)

  const fx = labF((L + 16) / 116) + a / 500
  const fy = labF((L + 16) / 116)
  const fz = labF((L + 16) / 116) - b / 200

  const x = D65_XN * labFInv(fx)
  const y = D65_YN * labFInv(fy)
  const z = D65_ZN * labFInv(fz)

  // XYZ to linear sRGB
  const rl = x * 3.240_454_2 + y * -1.537_138_5 + z * -0.498_531_4
  const gl = x * -0.969_266 + y * 1.876_010_8 + z * 0.041_556
  const bl = x * 0.055_643_4 + y * -0.204_025_9 + z * 1.057_225_2

  return [
    clamp(Math.round(linearToSrgb(rl) * 255), 0, 255),
    clamp(Math.round(linearToSrgb(gl) * 255), 0, 255),
    clamp(Math.round(linearToSrgb(bl) * 255), 0, 255),
  ]
}

/**
 * Convert LCH to RGB (CIE LCH, cylindrical form of Lab).
 * @param L - Lightness [0, 100]
 * @param C - Chroma
 * @param H - Hue in degrees [0, 360]
 * @returns Tuple of [r, g, b] in [0, 255]
 */
export function lchToRgb(
  L: number,
  C: number,
  H: number,
): [number, number, number] {
  const a = C * Math.cos(degToRad(H))
  const b = C * Math.sin(degToRad(H))
  return labToRgb(L, a, b)
}

/**
 * Convert OKLab to RGB.
 * @param L - Lightness [0, 1]
 * @param a - Green-red axis
 * @param b - Blue-yellow axis
 * @returns Tuple of [r, g, b] in [0, 255]
 */
export function oklabToRgb(
  L: number,
  a: number,
  b: number,
): [number, number, number] {
  L = clamp(L, 0, 1)

  const l_ = L + 0.396_337_777_4 * a + 0.215_803_757_3 * b
  const m_ = L - 0.105_561_345_8 * a - 0.063_854_172_8 * b
  const s_ = L - 0.089_484_177_5 * a - 1.291_485_548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  // OKLab to linear sRGB
  const rl = +4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s
  const gl = -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s
  const bl = -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s

  return [
    clamp(Math.round(linearToSrgb(rl) * 255), 0, 255),
    clamp(Math.round(linearToSrgb(gl) * 255), 0, 255),
    clamp(Math.round(linearToSrgb(bl) * 255), 0, 255),
  ]
}

/**
 * Convert OKLCH to RGB (cylindrical form of OKLab).
 * @param L - Lightness [0, 1]
 * @param C - Chroma
 * @param H - Hue in degrees [0, 360]
 * @returns Tuple of [r, g, b] in [0, 255]
 */
export function oklchToRgb(
  L: number,
  C: number,
  H: number,
): [number, number, number] {
  const a = C * Math.cos(degToRad(H))
  const b = C * Math.sin(degToRad(H))
  return oklabToRgb(L, a, b)
}

/**
 * Format RGB values as a CSS color string.
 * Uses rgba() if alpha is provided and < 1, otherwise rgb().
 * @param r - Red value [0, 255]
 * @param g - Green value [0, 255]
 * @param b - Blue value [0, 255]
 * @param a - Optional alpha value [0, 1]
 * @returns A CSS rgb() or rgba() string
 */
export function rgbString(r: number, g: number, b: number, a?: number): string {
  r = clamp(Math.round(r), 0, 255)
  g = clamp(Math.round(g), 0, 255)
  b = clamp(Math.round(b), 0, 255)

  if (a !== undefined && a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`
  }

  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Parse a color function value that may be a percentage or number.
 * @param value - The string to parse
 * @returns The raw number value
 */
export { parsePercent }
