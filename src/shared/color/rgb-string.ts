/**
 * Parse a CSS rgb()/rgba() string to numeric RGB values.
 *
 * @param color - The CSS rgb() color string, e.g. "rgb(255, 0, 0)"
 * @returns Numeric RGB values, defaulting to black if parsing fails
 */
export function parseRgbString(color: string): {
  r: number
  g: number
  b: number
} {
  const match = color.match(
    /rgba?\(\s*(?<red>\d+)\s*,\s*(?<green>\d+)\s*,\s*(?<blue>\d+)/u,
  )
  if (!match) {
    return { r: 0, g: 0, b: 0 }
  }
  const { blue, green, red } = match.groups ?? {}
  if (!red || !green || !blue) {
    return { r: 0, g: 0, b: 0 }
  }

  return {
    r: Number.parseInt(red),
    g: Number.parseInt(green),
    b: Number.parseInt(blue),
  }
}

/**
 * Convert an rgb()/rgba() string to an opaque rgb() string for marker display.
 *
 * @param color - The CSS rgb() or rgba() color string
 * @returns An opaque CSS rgb() string
 */
export function toOpaqueRgbString(color: string): string {
  const { b, g, r } = parseRgbString(color)
  return `rgb(${r}, ${g}, ${b})`
}
