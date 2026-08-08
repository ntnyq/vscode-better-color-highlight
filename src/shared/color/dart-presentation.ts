import type { RgbaColor } from './presentation'

const DART_COLOR_HEX_SOURCE_REGEX = /^Color\(\s*0x[a-f0-9]{8}\s*\)$/iu
const DART_COLOR_FROM_ARGB_SOURCE_REGEX =
  /^Color\.fromARGB\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/u

/**
 * Check whether source text is one of the supported Dart color constructors.
 *
 * @param text - Exact detected source text
 * @returns Whether the text can be safely rewritten as Dart
 */
export function isDartColorSource(text: string): boolean {
  const normalized = text.trim()
  return (
    DART_COLOR_HEX_SOURCE_REGEX.test(normalized) ||
    DART_COLOR_FROM_ARGB_SOURCE_REGEX.test(normalized)
  )
}

/**
 * Format a color using the Dart constructor style of the original source.
 *
 * @param color - Numeric RGBA channel values
 * @param sourceText - Exact detected Dart source text
 * @returns Valid Dart replacement text, or null for unsupported source
 */
export function formatDartColor(
  color: RgbaColor,
  sourceText: string,
): string | null {
  const normalized = sourceText.trim()
  const alpha = toByte(color.a * 255)
  const red = toByte(color.r)
  const green = toByte(color.g)
  const blue = toByte(color.b)

  if (DART_COLOR_HEX_SOURCE_REGEX.test(normalized)) {
    return `Color(0x${toHexByte(alpha)}${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)})`
  }

  if (DART_COLOR_FROM_ARGB_SOURCE_REGEX.test(normalized)) {
    return `Color.fromARGB(${alpha}, ${red}, ${green}, ${blue})`
  }

  return null
}

/** Clamp and round one numeric channel to an 8-bit byte. */
function toByte(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 255))
}

/** Format an 8-bit byte as two lowercase hexadecimal digits. */
function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0')
}
