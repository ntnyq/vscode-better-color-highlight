import type { DecorationRenderOptions, OverviewRulerLane } from 'vscode'
import { getContrastColor } from '../color/contrast'
import type { MarkerType } from '../core/types'

/**
 * Parse a CSS rgb()/rgba() string to numeric RGB values.
 *
 * @param color - The CSS rgb() color string (e.g. "rgb(255, 0, 0)" or "rgba(255, 0, 0, 0.5)")
 * @returns A tuple of [r, g, b] numeric values, defaults to [0, 0, 0] if parsing fails
 */
function parseRgbString(color: string): {
  r: number
  g: number
  b: number
} {
  const match = color.match(
    /rgba?\(\s*(?<red>\d+)\s*,\s*(?<green>\d+)\s*,\s*(?<blue>\d+)/u,
  )
  if (!match) return { r: 0, g: 0, b: 0 }
  const { blue, green, red } = match.groups ?? {}
  if (!red || !green || !blue) return { r: 0, g: 0, b: 0 }

  return {
    r: Number.parseInt(red),
    g: Number.parseInt(green),
    b: Number.parseInt(blue),
  }
}

function toOpaqueRgbString(color: string): string {
  const { b, g, r } = parseRgbString(color)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Build VS Code decoration render options for a given marker type and color.
 *
 * @param markerType - The decoration style: 'background', 'outline', 'foreground', 'underline', 'dot-before', or 'dot-after'
 * @param color - The CSS rgb() color string for the decoration
 * @param markRuler - Whether to show the color in the overview ruler
 * @returns The decoration render options object
 */
export function buildDecorationOptions(
  markerType: MarkerType,
  color: string,
  markRuler: boolean,
): DecorationRenderOptions {
  const options: DecorationRenderOptions = {}
  const { b, g, r } = parseRgbString(color)
  const displayColor = toOpaqueRgbString(color)

  if (markRuler) {
    options.overviewRulerColor = displayColor
    options.overviewRulerLane = 2 satisfies OverviewRulerLane.Center
  }

  switch (markerType) {
    case 'background': {
      options.backgroundColor = displayColor
      options.color = getContrastColor(r, g, b)
      options.border = `3px solid ${displayColor}`
      options.borderRadius = '3px'
      break
    }
    case 'outline': {
      options.border = `3px solid ${displayColor}`
      break
    }
    case 'foreground': {
      options.color = displayColor
      break
    }
    case 'underline': {
      // VS Code doesn't natively support colored underline via textDecoration,
      // so we use a workaround with border-bottom via the textDecoration hack
      options.textDecoration = `none; border-bottom: solid 2px ${displayColor}`
      break
    }
    case 'dot-before': {
      options.before = {
        contentText: ' ',
        margin: '0.1em 0.2em 0 0.2em',
        width: '0.7em',
        height: '0.7em',
        backgroundColor: displayColor,
        // borderRadius not in VS Code types but supported at runtime
        ...({ borderRadius: '50%' } as Record<string, string>),
      }
      break
    }
    case 'dot-after': {
      options.after = {
        contentText: ' ',
        margin: '0.1em 0.2em 0 0.2em',
        width: '0.7em',
        height: '0.7em',
        backgroundColor: displayColor,
        ...({ borderRadius: '50%' } as Record<string, string>),
      }
      break
    }
  }

  return options
}
