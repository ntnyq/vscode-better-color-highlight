import type { RgbaColor } from '../../../shared/color/presentation'
import { parseDartColorSource, type ParsedDartColorSource } from './parser'

/** Check whether source text is a supported Dart color expression. */
export function isDartColorSource(text: string): boolean {
  return parseDartColorSource(text) !== null
}

/** Format a color using the editable Dart constructor style of the source. */
export function formatDartColor(
  color: RgbaColor,
  sourceText: string,
): string | null {
  const source = parseDartColorSource(sourceText)
  if (!source || source.kind === 'material') {
    return null
  }

  return formatParsedDartColor(color, source)
}

/** Format an alpha adjustment while preserving source floating-point channels. */
export function formatDartColorWithAlphaDelta(
  delta: number,
  sourceText: string,
): string | null {
  const source = parseDartColorSource(sourceText)
  if (!source || source.kind === 'material') {
    return null
  }

  return formatParsedDartColor(
    { ...source.color, a: source.color.a + delta },
    source,
  )
}

function formatParsedDartColor(
  color: RgbaColor,
  source: ParsedDartColorSource,
): string | null {
  const alpha = toByte(color.a * 255)
  const red = toByte(color.r)
  const green = toByte(color.g)
  const blue = toByte(color.b)

  switch (source.kind) {
    case 'hex': {
      return `Color(0x${toHexByte(alpha)}${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)})`
    }
    case 'fromARGB': {
      return `Color.fromARGB(${alpha}, ${red}, ${green}, ${blue})`
    }
    case 'fromRGBO': {
      return `Color.fromRGBO(${red}, ${green}, ${blue}, ${formatNormalized(color.a)})`
    }
    case 'from': {
      const colorSpace = source.hasExplicitSrgbColorSpace
        ? ', colorSpace: ColorSpace.sRGB'
        : ''
      return `Color.from(alpha: ${formatNormalizedComponent(color.a)}, red: ${formatNormalizedComponent(color.r / 255)}, green: ${formatNormalizedComponent(color.g / 255)}, blue: ${formatNormalizedComponent(color.b / 255)}${colorSpace})`
    }
    case 'material': {
      return null
    }
  }
}

function toByte(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 255))
}

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function formatNormalized(value: number): string {
  const normalized = Math.min(Math.max(value, 0), 1)
  return String(Number(normalized.toFixed(3)))
}

function formatNormalizedComponent(value: number): string {
  const normalized = Math.min(Math.max(value, 0), 1)
  return String(Number(normalized.toPrecision(15)))
}
