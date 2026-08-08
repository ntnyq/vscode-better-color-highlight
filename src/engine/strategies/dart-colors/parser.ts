import { hexARGBToRgb } from '../../../shared/color'
import type { RgbaColor } from '../../../shared/color/presentation'
import { FLUTTER_MATERIAL_COLOR_ARGB } from './material-colors'
import { stripDartComments } from './scanner'

const DART_INTEGER_LITERAL_REGEX = /^\d(?:_?\d)*$/u
const DART_NUMBER_LITERAL_REGEX =
  /^(?:(?:\d(?:_?\d)*)(?:\.(?:\d(?:_?\d)*)?)?|\.(?:\d(?:_?\d)*))(?:e[+-]?\d(?:_?\d)*)?$/iu
const DART_COLOR_HEX_REGEX =
  /^Color\(\s*(?<hex>0[xX][a-fA-F0-9]{8})\s*,?\s*\)$/u
const DART_MATERIAL_COLOR_REGEX = /^Colors\.(?<name>[_a-zA-Z][_a-zA-Z0-9]*)$/u

export type DartColorSourceKind =
  | 'from'
  | 'fromARGB'
  | 'fromRGBO'
  | 'hex'
  | 'material'

export interface ParsedDartColorSource {
  readonly color: RgbaColor
  readonly hasExplicitSrgbColorSpace: boolean
  readonly kind: DartColorSourceKind
}

/** Parse one exact supported Dart color expression. */
export function parseDartColorSource(
  sourceText: string,
): ParsedDartColorSource | null {
  const source = sourceText.trim()

  return (
    parseHexColor(source) ??
    parseFromArgbColor(source) ??
    parseFromRgboColor(source) ??
    parseFromColor(source) ??
    parseMaterialColor(source)
  )
}

/** Whether a CSS named-color range belongs to a Flutter Material reference. */
export function isDartMaterialColorNameAt(
  text: string,
  start: number,
  end: number,
): boolean {
  const name = text.slice(start, end)
  const qualifierStart = start - 'Colors.'.length

  return (
    qualifierStart >= 0 &&
    text.slice(qualifierStart, start) === 'Colors.' &&
    FLUTTER_MATERIAL_COLOR_ARGB.has(name)
  )
}

function parseHexColor(source: string): ParsedDartColorSource | null {
  const match = source.match(DART_COLOR_HEX_REGEX)
  const hex = match?.groups?.hex
  if (!hex) {
    return null
  }

  const color = hexARGBToRgb(hex)
  if (!color) {
    return null
  }

  return {
    color: toRgbaColor(color),
    hasExplicitSrgbColorSpace: false,
    kind: 'hex',
  }
}

function parseFromArgbColor(source: string): ParsedDartColorSource | null {
  const parameters = parsePositionalParameters(source, 'Color.fromARGB')
  if (parameters?.length !== 4) {
    return null
  }

  const channels = parameters.map(parseByteLiteral)
  if (channels.some(channel => channel === null)) {
    return null
  }
  const [alpha, red, green, blue] = channels as [number, number, number, number]

  return {
    color: { a: alpha / 255, b: blue, g: green, r: red },
    hasExplicitSrgbColorSpace: false,
    kind: 'fromARGB',
  }
}

function parseFromRgboColor(source: string): ParsedDartColorSource | null {
  const parameters = parsePositionalParameters(source, 'Color.fromRGBO')
  if (parameters?.length !== 4) {
    return null
  }

  const red = parseByteLiteral(parameters[0])
  const green = parseByteLiteral(parameters[1])
  const blue = parseByteLiteral(parameters[2])
  const alpha = parseNormalizedLiteral(parameters[3])
  if (red === null || green === null || blue === null || alpha === null) {
    return null
  }

  return {
    color: { a: alpha, b: blue, g: green, r: red },
    hasExplicitSrgbColorSpace: false,
    kind: 'fromRGBO',
  }
}

function parseFromColor(source: string): ParsedDartColorSource | null {
  const parameters = parseParameters(source, 'Color.from')
  if (!parameters) {
    return null
  }

  const namedParameters = new Map<string, string>()
  for (const parameter of parameters) {
    const separatorIndex = parameter.indexOf(':')
    if (separatorIndex <= 0) {
      return null
    }

    const name = parameter.slice(0, separatorIndex).trim()
    const sourceValue = parameter.slice(separatorIndex + 1).trim()
    if (!sourceValue || namedParameters.has(name)) {
      return null
    }
    namedParameters.set(name, sourceValue)
  }

  const allowedNames = new Set(['alpha', 'blue', 'colorSpace', 'green', 'red'])
  if ([...namedParameters.keys()].some(name => !allowedNames.has(name))) {
    return null
  }

  const alpha = parseNormalizedParameter(namedParameters, 'alpha')
  const red = parseNormalizedParameter(namedParameters, 'red')
  const green = parseNormalizedParameter(namedParameters, 'green')
  const blue = parseNormalizedParameter(namedParameters, 'blue')
  if (alpha === null || red === null || green === null || blue === null) {
    return null
  }

  const colorSpace = namedParameters.get('colorSpace')
  if (colorSpace !== undefined && colorSpace !== 'ColorSpace.sRGB') {
    return null
  }

  return {
    color: { a: alpha, b: blue * 255, g: green * 255, r: red * 255 },
    hasExplicitSrgbColorSpace: colorSpace !== undefined,
    kind: 'from',
  }
}

function parseMaterialColor(source: string): ParsedDartColorSource | null {
  const name = source.match(DART_MATERIAL_COLOR_REGEX)?.groups?.name
  const argb = name ? FLUTTER_MATERIAL_COLOR_ARGB.get(name) : undefined
  if (!argb) {
    return null
  }

  const color = hexARGBToRgb(argb)
  if (!color) {
    return null
  }

  return {
    color: toRgbaColor(color),
    hasExplicitSrgbColorSpace: false,
    kind: 'material',
  }
}

function parsePositionalParameters(
  source: string,
  constructorName: string,
): string[] | null {
  const parameters = parseParameters(source, constructorName)
  if (!parameters || parameters.some(parameter => parameter.includes(':'))) {
    return null
  }
  return parameters
}

function parseParameters(
  source: string,
  constructorName: string,
): string[] | null {
  if (!source.startsWith(constructorName)) {
    return null
  }

  const body = source
    .slice(constructorName.length)
    .match(/^\s*\((?<body>[\s\S]*)\)$/u)?.groups?.body
  if (body === undefined) {
    return null
  }

  const parameters = stripDartComments(body)
    .split(',')
    .map(parameter => parameter.trim())
  if (parameters.at(-1) === '') {
    parameters.pop()
  }
  if (parameters.length === 0 || parameters.some(parameter => !parameter)) {
    return null
  }
  return parameters
}

function parseByteLiteral(source: string): number | null {
  if (!DART_INTEGER_LITERAL_REGEX.test(source)) {
    return null
  }

  const channel = Number(source.replaceAll('_', ''))
  return Number.isInteger(channel) && channel >= 0 && channel <= 255
    ? channel
    : null
}

function parseNormalizedParameter(
  parameters: ReadonlyMap<string, string>,
  name: string,
): number | null {
  const source = parameters.get(name)
  return source === undefined ? null : parseNormalizedLiteral(source)
}

function parseNormalizedLiteral(source: string): number | null {
  if (!DART_NUMBER_LITERAL_REGEX.test(source)) {
    return null
  }

  const channel = Number(source.replaceAll('_', ''))
  return Number.isFinite(channel) && channel >= 0 && channel <= 1
    ? channel
    : null
}

function toRgbaColor(color: {
  readonly a?: number
  readonly b: number
  readonly g: number
  readonly r: number
}): RgbaColor {
  return { a: color.a ?? 1, b: color.b, g: color.g, r: color.r }
}
