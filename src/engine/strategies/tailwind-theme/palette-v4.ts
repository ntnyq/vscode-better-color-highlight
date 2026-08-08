import colors from 'tailwindcss/colors'
import { createTailwindV3Palette } from './palette-v3'
import type { TailwindColorMode } from './types'

const EXCLUDED_COLOR_EXPORTS = new Set(['current', 'inherit', 'transparent'])

/**
 * Create the official base palette selected by compatibility mode and source
 * signals. Values remain in Tailwind's published color notation.
 */
export function createTailwindBasePalette(
  mode: TailwindColorMode,
  hasV4Signal: boolean,
): Map<string, string> {
  if (mode === 'v3' || (mode === 'auto' && !hasV4Signal)) {
    return createTailwindV3Palette()
  }

  const palette = new Map<string, string>()

  for (const [family, value] of Object.entries(colors)) {
    if (EXCLUDED_COLOR_EXPORTS.has(family)) {
      continue
    }

    if (typeof value === 'string') {
      palette.set(family, value)
      continue
    }

    for (const [shade, shadeValue] of Object.entries(value)) {
      if (typeof shadeValue === 'string') {
        palette.set(`${family}-${shade}`, shadeValue)
      }
    }
  }

  return palette
}
