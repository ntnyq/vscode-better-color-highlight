import { hexARGBToRgb, rgbString } from '../../shared/color'
import type { ColorMatch } from '../detection'

const COMPOSE_ARGB_HEX_REGEX =
  /(?<prefix>^|[^\w.])(?<source>Color\(\s*(?<hex>0x[a-f\d]{8})(?:u?l)?\s*\))/giu

/** Detect statically packed ARGB colors in Jetpack Compose constructors. */
export function findComposeArgbHexColors(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const match of text.matchAll(COMPOSE_ARGB_HEX_REGEX)) {
    const prefix = match.groups?.prefix ?? ''
    const source = match.groups?.source
    const hex = match.groups?.hex
    if (!source || !hex) {
      continue
    }

    const color = hexARGBToRgb(hex)
    if (!color) {
      continue
    }

    const start = (match.index ?? 0) + prefix.length
    matches.push({
      start,
      end: start + source.length,
      color: rgbString(color.r, color.g, color.b, color.a),
      editMode: 'source',
      sourceKind: 'compose-argb-hex',
    })
  }

  return matches
}
