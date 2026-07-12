import {
  colorSpaceToRgb,
  hexToRgb,
  hslToRgb,
  hwbToRgb,
  labToRgb,
  lchToRgb,
  oklabToRgb,
  oklchToRgb,
  rgbString,
} from '../../utils/color/convert'
import type { DtcgColorComponent, DtcgColorValue } from './types'

const RGB_LIKE_SPACES = new Set([
  'srgb',
  'srgb-linear',
  'display-p3',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d65',
  'xyz-d50',
])
const SIX_DIGIT_HEX_REGEX = /^#[\da-f]{6}$/iu

/**
 * Convert a structured DTCG color value to the canonical RGB representation.
 *
 * @param value - Unknown token value
 * @returns Canonical rgb()/rgba() string, or null when invalid
 */
export function resolveDtcgColor(value: unknown): string | null {
  if (!isDtcgColorValue(value)) {
    return null
  }

  const alpha = value.alpha ?? 1
  if (!isBoundedNumber(alpha, 0, 1)) {
    return null
  }

  if (
    !value.components.every(
      component => component === 'none' || Number.isFinite(component),
    )
  ) {
    return null
  }

  if (value.components.includes('none')) {
    const validationComponents = value.components.map(component =>
      component === 'none' ? 0 : component,
    )
    return convertComponents(value.colorSpace, validationComponents)
      ? resolveHexFallback(value.hex, alpha)
      : null
  }

  const components = value.components as readonly number[]
  const rgb = convertComponents(value.colorSpace, components)
  return rgb ? rgbString(...rgb, alpha) : null
}

/**
 * Check the required DTCG color object shape.
 */
function isDtcgColorValue(value: unknown): value is DtcgColorValue {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.colorSpace === 'string' &&
    Array.isArray(value.components) &&
    value.components.length === 3 &&
    value.components.every(isDtcgComponent) &&
    (value.alpha === undefined || typeof value.alpha === 'number') &&
    (value.hex === undefined || typeof value.hex === 'string')
  )
}

/**
 * Check one DTCG component primitive.
 */
function isDtcgComponent(value: unknown): value is DtcgColorComponent {
  return value === 'none' || typeof value === 'number'
}

/**
 * Convert validated numeric components according to their color space.
 */
function convertComponents(
  colorSpace: string,
  components: readonly number[],
): [number, number, number] | null {
  const [first, second, third] = components

  if (RGB_LIKE_SPACES.has(colorSpace)) {
    if (!components.every(component => isBoundedNumber(component, 0, 1))) {
      return null
    }
    const rgb = colorSpaceToRgb(colorSpace, first, second, third)
    return rgb[0] === null ? null : rgb
  }

  switch (colorSpace) {
    case 'hsl': {
      return convertHslComponents(first, second, third)
    }
    case 'hwb': {
      return convertHwbComponents(first, second, third)
    }
    case 'lab': {
      return convertLabComponents(first, second, third)
    }
    case 'lch': {
      return convertLchComponents(first, second, third)
    }
    case 'oklab': {
      return convertOklabComponents(first, second, third)
    }
    case 'oklch': {
      return convertOklchComponents(first, second, third)
    }
    default: {
      return null
    }
  }
}

function convertHslComponents(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] | null {
  return isHue(hue) &&
    isBoundedNumber(saturation, 0, 1) &&
    isBoundedNumber(lightness, 0, 1)
    ? hslToRgb(hue, saturation, lightness)
    : null
}

function convertHwbComponents(
  hue: number,
  whiteness: number,
  blackness: number,
): [number, number, number] | null {
  return isHue(hue) &&
    isBoundedNumber(whiteness, 0, 1) &&
    isBoundedNumber(blackness, 0, 1)
    ? hwbToRgb(hue, whiteness, blackness)
    : null
}

function convertLabComponents(
  lightness: number,
  a: number,
  b: number,
): [number, number, number] | null {
  return isBoundedNumber(lightness, 0, 100) ? labToRgb(lightness, a, b) : null
}

function convertLchComponents(
  lightness: number,
  chroma: number,
  hue: number,
): [number, number, number] | null {
  return isBoundedNumber(lightness, 0, 100) && chroma >= 0 && isHue(hue)
    ? lchToRgb(lightness, chroma, hue)
    : null
}

function convertOklabComponents(
  lightness: number,
  a: number,
  b: number,
): [number, number, number] | null {
  return isBoundedNumber(lightness, 0, 1) ? oklabToRgb(lightness, a, b) : null
}

function convertOklchComponents(
  lightness: number,
  chroma: number,
  hue: number,
): [number, number, number] | null {
  return isBoundedNumber(lightness, 0, 1) && chroma >= 0 && isHue(hue)
    ? oklchToRgb(lightness, chroma, hue)
    : null
}

/**
 * Resolve the specification's six-digit fallback when components are missing.
 */
function resolveHexFallback(
  hex: string | undefined,
  alpha: number,
): string | null {
  if (!hex || !SIX_DIGIT_HEX_REGEX.test(hex)) {
    return null
  }

  const rgb = hexToRgb(hex)
  return rgb ? rgbString(rgb.r, rgb.g, rgb.b, alpha) : null
}

/** Check an inclusive finite numeric interval. */
function isBoundedNumber(
  value: number,
  minimum: number,
  maximum: number,
): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum
}

/** Check a hue in the DTCG [0, 360) interval. */
function isHue(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 360
}

/** Check for a plain object-like record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
