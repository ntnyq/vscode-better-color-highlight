import { hexARGBToRgb } from '../../shared/color'
import type { RgbaColor } from '../../shared/color/presentation'
import type { ColorSourceKind } from '../detection'
import { parseAndroidColor } from '../strategies/android-colors'
import {
  formatDartColor,
  formatDartColorWithAlphaDelta,
  isDartColorSource,
} from '../strategies/dart-colors'
import { parseSwiftColor } from '../strategies/swift-colors'
import { parseUnityColor } from '../strategies/unity-colors'
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
  'android-color',
  'swift-color',
  'unity-color',
])

/**
 * Validate source syntax metadata received from command payloads.
 */
export function isColorSourceKind(value: unknown): value is ColorSourceKind {
  return (
    typeof value === 'string' &&
    COLOR_SOURCE_KINDS.has(value as ColorSourceKind)
  )
}

/**
 * Resolve source-specific presentation behavior from document context.
 */
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
    (languageId === 'kotlin' || languageId === 'java') &&
    parseAndroidColor(sourceText, languageId)
  ) {
    return 'android-color'
  }
  if (languageId === 'swift' && parseSwiftColor(sourceText)) {
    return 'swift-color'
  }
  if (languageId === 'csharp' && parseUnityColor(sourceText)) {
    return 'unity-color'
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

/**
 * Whether a source syntax serializes alpha before RGB channels.
 */
export function isArgbSourceKind(sourceKind?: ColorSourceKind): boolean {
  return (
    sourceKind === 'android-xml-hex' ||
    sourceKind === 'compose-argb-hex' ||
    sourceKind === 'dart'
  )
}

/**
 * Format a resolved color using its original language-specific syntax.
 */
export function formatColorForSource(
  color: RgbaColor,
  sourceText: string,
  sourceKind: ColorSourceKind,
): string | null {
  switch (sourceKind) {
    case 'android-color': {
      return parseAndroidColor(sourceText)?.format(color) ?? null
    }
    case 'swift-color': {
      return parseSwiftColor(sourceText)?.format(color) ?? null
    }
    case 'unity-color': {
      return parseUnityColor(sourceText)?.format(color) ?? null
    }
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

/**
 * Adjust alpha while preserving the original language-specific syntax.
 */
export function formatColorForSourceWithAlphaDelta(
  delta: number,
  sourceText: string,
  sourceKind: ColorSourceKind,
): string | null {
  if (sourceKind === 'dart') {
    return formatDartColorWithAlphaDelta(delta, sourceText)
  }

  if (
    sourceKind === 'android-color' ||
    sourceKind === 'swift-color' ||
    sourceKind === 'unity-color'
  ) {
    const parsers = {
      'android-color': parseAndroidColor,
      'swift-color': parseSwiftColor,
      'unity-color': parseUnityColor,
    }
    const parsed = parsers[sourceKind](sourceText)
    return (
      parsed?.format({
        ...parsed.color,
        a: Math.min(1, Math.max(0, parsed.color.a + delta)),
      }) ?? null
    )
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

/**
 * Parse packed Android or Compose ARGB source into RGBA channels.
 */
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

/**
 * Format Android XML HEX while retaining explicit alpha and letter case.
 */
function formatAndroidXmlHex(color: RgbaColor, sourceText: string): string {
  const channelCount = sourceText.length - 1
  const includeAlpha = color.a < 1 || channelCount === 4 || channelCount === 8
  return formatArgbHex(color, '#', includeAlpha, sourceText)
}

/**
 * Format a Compose Color constructor with packed ARGB channels.
 */
function formatComposeArgbHex(color: RgbaColor, sourceText: string): string {
  const sourceHex = sourceText.match(COMPOSE_ARGB_HEX_REGEX)?.groups?.hex ?? ''
  const hex = formatArgbHex(color, '0x', true, sourceHex)
  return sourceText.replace(sourceHex, hex)
}

/**
 * Serialize optional alpha before RGB using the source HEX letter case.
 */
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

/**
 * Clamp and round a channel to a two-digit hexadecimal byte.
 */
function toHexByte(value: number): string {
  return Math.round(Math.min(Math.max(value, 0), 255))
    .toString(16)
    .padStart(2, '0')
}

/**
 * Check whether the source uses uppercase HEX letters exclusively.
 */
function shouldUseUppercaseHex(sourceText: string): boolean {
  const letters = sourceText.replaceAll(/[^a-f]/giu, '')
  return /[A-F]/u.test(letters) && !/[a-f]/u.test(letters)
}
