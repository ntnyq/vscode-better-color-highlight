import type { DecorationRenderOptions, OverviewRulerLane } from 'vscode'
import { getContrastColor } from '../color/contrast'
import type { MarkerType } from '../core/types'

/**
 * Parse a CSS rgb() string to numeric RGB values.
 * e.g. "rgb(255, 0, 0)" -> [255, 0, 0]
 * e.g. "rgba(255, 0, 0, 0.5)" -> [255, 0, 0]
 */
function parseRgbString(color: string): [number, number, number] {
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!match) return [0, 0, 0]
  return [
    Number.parseInt(match[1]),
    Number.parseInt(match[2]),
    Number.parseInt(match[3]),
  ]
}

/**
 * Build VS Code decoration render options for a given marker type and color.
 */
export function buildDecorationOptions(
  markerType: MarkerType,
  color: string,
  markRuler: boolean,
): DecorationRenderOptions {
  const options: DecorationRenderOptions = {}

  if (markRuler) {
    options.overviewRulerColor = color
    options.overviewRulerLane = 2 satisfies OverviewRulerLane.Center
  }

  switch (markerType) {
    case 'background': {
      const [r, g, b] = parseRgbString(color)
      options.backgroundColor = color
      options.color = getContrastColor(r, g, b)
      options.border = `3px solid ${color}`
      options.borderRadius = '3px'
      break
    }
    case 'outline': {
      options.border = `3px solid ${color}`
      break
    }
    case 'foreground': {
      options.color = color
      break
    }
    case 'underline': {
      // VS Code doesn't natively support colored underline via textDecoration,
      // so we use a workaround with border-bottom via the textDecoration hack
      options.textDecoration = `none; border-bottom: solid 2px ${color}`
      break
    }
    case 'dot-before': {
      options.before = {
        contentText: ' ',
        margin: '0.1em 0.2em 0 0.2em',
        width: '0.7em',
        height: '0.7em',
        backgroundColor: color,
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
        backgroundColor: color,
        ...({ borderRadius: '50%' } as Record<string, string>),
      }
      break
    }
  }

  return options
}
