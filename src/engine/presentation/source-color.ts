import { hexARGBToRgb } from '../../shared/color'
import type { RgbaColor } from '../../shared/color/presentation'
import type { ColorSourceKind } from '../detection'
import {
  formatDartColor,
  formatDartColorWithAlphaDelta,
  isDartColorSource,
} from '../strategies/dart-colors'
import { isAndroidResourceXml } from './source-context'

const ANDROID_XML_HEX_REGEX = /^#[a-f\d]{3,4}(?:[a-f\d]{2}){0,2}$/iu
const COMPOSE_ARGB_HEX_REGEX = /^Color\(\s*(?<hex>0x[a-f\d]{8})(?:u?l)?\s*\)$/iu

interface ResolveColorSourceKindOptions {
  readonly filePath?: string
  readonly languageId: string
  readonly sourceText: string
}

const COLOR_SOURCE_KINDS: ReadonlySet<ColorSourceKind> = new Set([
  'android-xml-hex',
  'compose-argb-hex',
  'dart',
])

/** Validate source syntax metadata received from command payloads. */
export function isColorSourceKind(value: unknown): value is ColorSourceKind {
  return (
    typeof value === 'string' &&
    COLOR_SOURCE_KINDS.has(value as ColorSourceKind)
  )
}

/** Resolve source-specific presentation behavior from document context. */
export function resolveColorSourceKind({
  filePath,
  languageId,
  sourceText,
}: ResolveColorSourceKindOptions): ColorSourceKind | undefined {
  if (languageId === 'dart' && isDartColorSource(sourceText)) {
    return 'dart'
  }

  if (languageId === 'kotlin' && COMPOSE_ARGB_HEX_REGEX.test(sourceText)) {
    return 'compose-argb-hex'
  }

  if (
    languageId === 'xml' &&
    isAndroidResourceXml(languageId, filePath) &&
    ANDROID_XML_HEX_REGEX.test(sourceText)
  ) {
    return 'android-xml-hex'
  }

  return undefined
}

/** Whether a source syntax serializes alpha before RGB channels. */
export function isArgbSourceKind(sourceKind?: ColorSourceKind): boolean {
  return (
    sourceKind === 'android-xml-hex' ||
    sourceKind === 'compose-argb-hex' ||
    sourceKind === 'dart'
  )
}

/** Format a resolved color using its original language-specific syntax. */
export function formatColorForSource(
  color: RgbaColor,
  sourceText: string,
  sourceKind: ColorSourceKind,
): string | null {
  switch (sourceKind) {
    case 'android-xml-hex': {
      return formatAndroidXmlHex(color, sourceText)
    }
    case 'compose-argb-hex': {
      return formatComposeArgbHex(color, sourceText)
    }
    case 'dart': {
      return formatDartColor(color, sourceText)
    }
  }
}

/** Adjust alpha while preserving the original language-specific syntax. */
export function formatColorForSourceWithAlphaDelta(
  delta: number,
  sourceText: string,
  sourceKind: ColorSourceKind,
): string | null {
  if (sourceKind === 'dart') {
    return formatDartColorWithAlphaDelta(delta, sourceText)
  }

  const color = parsePackedArgbSource(sourceText, sourceKind)
  if (!color) {
    return null
  }

  return formatColorForSource(
    { ...color, a: Math.min(Math.max(color.a + delta, 0), 1) },
    sourceText,
    sourceKind,
  )
}

function parsePackedArgbSource(
  sourceText: string,
  sourceKind: ColorSourceKind,
): RgbaColor | null {
  let hex: string | undefined
  if (sourceKind === 'android-xml-hex') {
    hex = sourceText
  } else if (sourceKind === 'compose-argb-hex') {
    hex = sourceText.match(COMPOSE_ARGB_HEX_REGEX)?.groups?.hex
  }

  if (!hex) {
    return null
  }

  const color = hexARGBToRgb(hex)
  return color ? { a: color.a ?? 1, b: color.b, g: color.g, r: color.r } : null
}

function formatAndroidXmlHex(color: RgbaColor, sourceText: string): string {
  const channelCount = sourceText.length - 1
  const includeAlpha = color.a < 1 || channelCount === 4 || channelCount === 8
  return formatArgbHex(color, '#', includeAlpha, sourceText)
}

function formatComposeArgbHex(color: RgbaColor, sourceText: string): string {
  const sourceHex = sourceText.match(COMPOSE_ARGB_HEX_REGEX)?.groups?.hex ?? ''
  const hex = formatArgbHex(color, '0x', true, sourceHex)
  return `Color(${hex})`
}

function formatArgbHex(
  color: RgbaColor,
  prefix: '#' | '0x',
  includeAlpha: boolean,
  sourceText: string,
): string {
  const alpha = includeAlpha ? toHexByte(color.a * 255) : ''
  const rgb = `${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(color.b)}`
  const channels = `${alpha}${rgb}`
  return `${prefix}${shouldUseUppercaseHex(sourceText) ? channels.toUpperCase() : channels}`
}

function toHexByte(value: number): string {
  return Math.round(Math.min(Math.max(value, 0), 255))
    .toString(16)
    .padStart(2, '0')
}

function shouldUseUppercaseHex(sourceText: string): boolean {
  const letters = sourceText.replaceAll(/[^a-f]/giu, '')
  return /[A-F]/u.test(letters) && !/[a-f]/u.test(letters)
}
