import { useCommand } from 'reactive-vscode'
import { env, Range as VscodeRange, window, workspace } from 'vscode'
import { config } from './config'
import { getStrategies } from './core/strategy-registry'
import { getColorHover } from './hover/color-hover'
import { commands } from './meta'
import {
  formatColorPresentation,
  getColorPresentationsFromRgba,
  parseResolvedColor,
  withAlpha,
} from './utils/color/presentation'
import type {
  ColorPresentationFormat,
  ColorPresentations,
} from './utils/color/presentation'

/**
 * Color presentation formats supported by copy commands.
 */
type CopyColorFormat = ColorPresentationFormat

interface OffsetRange {
  readonly end: number
  readonly start: number
}

interface ReplaceColorPayload {
  readonly originalText: string
  readonly range: OffsetRange
  readonly value: string
}

interface AdjustColorAlphaPayload {
  readonly delta: number
  readonly originalColor: string
  readonly originalText: string
  readonly range: OffsetRange
}

const REPLACE_COMMANDS = {
  hex: 'color-highlight.replaceColorAsHex',
  hsl: 'color-highlight.replaceColorAsHsl',
  oklch: 'color-highlight.replaceColorAsOklch',
  rgb: 'color-highlight.replaceColorAsRgb',
} as const

const ADJUST_ALPHA_COMMAND = 'color-highlight.adjustColorAlpha'

/**
 * Register the enable and disable commands for color highlighting.
 */
export function useCommands() {
  useCommand(commands.enable, () => {
    config.update('enable', true)
  })

  useCommand(commands.disable, () => {
    config.update('enable', false)
  })

  useCommand(commands.copyColorAsHex, value => copyColorValue('hex', value))
  useCommand(commands.copyColorAsRgb, value => copyColorValue('rgb', value))
  useCommand(commands.copyColorAsHsl, value => copyColorValue('hsl', value))
  useCommand(commands.copyColorAsOklch, value => copyColorValue('oklch', value))

  useCommand(REPLACE_COMMANDS.hex, value => replaceColorValue('hex', value))
  useCommand(REPLACE_COMMANDS.rgb, value => replaceColorValue('rgb', value))
  useCommand(REPLACE_COMMANDS.hsl, value => replaceColorValue('hsl', value))
  useCommand(REPLACE_COMMANDS.oklch, value => replaceColorValue('oklch', value))
  useCommand(ADJUST_ALPHA_COMMAND, value => adjustColorAlpha(value))
}

/**
 * Copy an explicit color value, or resolve the requested format from the active editor.
 *
 * @param format - Presentation format requested by the command.
 * @param value - Optional value supplied by a hover command link.
 */
async function copyColorValue(format: CopyColorFormat, value: unknown) {
  const resolvedValue =
    typeof value === 'string' && value.length > 0
      ? value
      : await getActiveEditorColorValue(format)

  if (!resolvedValue) {
    return
  }

  await env.clipboard.writeText(resolvedValue)
  await window.showInformationMessage(`Copied ${resolvedValue}`)
}

/**
 * Resolve the requested color representation from the active editor selection.
 *
 * @param format - Presentation format requested by the command.
 * @returns The formatted color value under the cursor, if available.
 */
async function getActiveEditorColorValue(
  format: CopyColorFormat,
): Promise<string | undefined> {
  const editor = window.activeTextEditor
  if (!editor) {
    return undefined
  }

  const document = editor.document
  const hover = await getColorHover({
    config,
    detectors: getStrategies(document.languageId, config),
    filePath: document.uri.toString(),
    languageId: document.languageId,
    offset: document.offsetAt(editor.selection.active),
    text: document.getText(),
    workspaceIsTrusted: workspace.isTrusted,
  })

  if (!hover) {
    return undefined
  }

  return getPresentationValue(hover.presentations, format)
}

/**
 * Select one formatted value from a color presentation set.
 *
 * @param presentations - Available color presentation strings.
 * @param format - Requested copy format.
 * @returns The formatted color value for the requested format.
 */
function getPresentationValue(
  presentations: ColorPresentations,
  format: CopyColorFormat,
): string {
  return formatColorPresentation(presentations, format)
}

/**
 * Replace a color range with a hover-provided formatted value.
 *
 * @param format - Presentation format being inserted.
 * @param value - Command payload supplied by a hover link.
 */
async function replaceColorValue(format: CopyColorFormat, value: unknown) {
  const payload = getReplaceColorPayload(value)
  if (!payload) {
    return
  }

  const replacement =
    format === 'hex'
      ? preserveHexCase(payload.value, payload.originalText)
      : payload.value

  await replaceActiveEditorRange(payload, replacement)
}

/**
 * Adjust a color alpha channel and replace the original source range.
 *
 * @param value - Command payload supplied by a hover link.
 */
async function adjustColorAlpha(value: unknown) {
  const payload = getAdjustColorAlphaPayload(value)
  if (!payload) {
    return
  }

  const color = parseResolvedColor(payload.originalColor)
  if (!color) {
    return
  }

  const nextColor = withAlpha(color, color.a + payload.delta)
  const presentations = getColorPresentationsFromRgba(nextColor)
  const format = getFormatForSourceText(payload.originalText)
  const replacement = formatColorPresentation(presentations, format)
  const normalizedReplacement =
    format === 'hex'
      ? preserveHexCase(replacement, payload.originalText)
      : replacement

  await replaceActiveEditorRange(payload, normalizedReplacement)
}

/**
 * Replace a range in the active editor only when it still contains the
 * original source text captured by the hover.
 *
 * @param payload - Range and original text from the hover command payload.
 * @param replacement - Text to insert.
 * @returns Whether VS Code accepted the edit.
 */
async function replaceActiveEditorRange(
  payload: Pick<ReplaceColorPayload, 'originalText' | 'range'>,
  replacement: string,
): Promise<boolean> {
  const editor = window.activeTextEditor
  if (!editor || !isValidOffsetRange(payload.range)) {
    return false
  }

  const document = editor.document
  const range = new VscodeRange(
    document.positionAt(payload.range.start),
    document.positionAt(payload.range.end),
  )

  if (document.getText(range) !== payload.originalText) {
    return false
  }

  return await editor.edit(builder => {
    builder.replace(range, replacement)
  })
}

/**
 * Choose an output format for alpha adjustment from the original source text.
 *
 * @param text - Original source text covered by the hover range.
 * @returns Presentation format used for replacement.
 */
function getFormatForSourceText(text: string): CopyColorFormat {
  const normalized = text.trim().toLowerCase()

  if (normalized.startsWith('#') || normalized.startsWith('0x')) {
    return 'hex'
  }

  if (normalized.startsWith('hsl')) {
    return 'hsl'
  }

  if (normalized.startsWith('oklch')) {
    return 'oklch'
  }

  return 'rgb'
}

/**
 * Preserve uppercase style for HEX-like source values.
 *
 * @param value - Lowercase HEX value generated by presentations.
 * @param originalText - Original source text.
 * @returns HEX value with source text casing applied.
 */
function preserveHexCase(value: string, originalText: string): string {
  return shouldUseUppercaseHex(originalText) ? value.toUpperCase() : value
}

/**
 * Check whether HEX output should use uppercase letters.
 *
 * @param text - Original source text.
 * @returns Whether the text uses uppercase HEX letters only.
 */
function shouldUseUppercaseHex(text: string): boolean {
  const hexLetters = text.replace(/^#|^0x/iu, '').replaceAll(/[^a-f]/giu, '')
  return /[A-F]/u.test(hexLetters) && !/[a-f]/u.test(hexLetters)
}

/**
 * Validate a replacement command payload.
 *
 * @param value - Unknown command argument.
 * @returns A replacement payload, if valid.
 */
function getReplaceColorPayload(
  value: unknown,
): ReplaceColorPayload | undefined {
  if (!isRecord(value) || typeof value.value !== 'string') {
    return undefined
  }

  const range = getOffsetRange(value.range)
  if (!range || typeof value.originalText !== 'string') {
    return undefined
  }

  return {
    originalText: value.originalText,
    range,
    value: value.value,
  }
}

/**
 * Validate an alpha adjustment command payload.
 *
 * @param value - Unknown command argument.
 * @returns An alpha adjustment payload, if valid.
 */
function getAdjustColorAlphaPayload(
  value: unknown,
): AdjustColorAlphaPayload | undefined {
  if (
    !isRecord(value) ||
    typeof value.delta !== 'number' ||
    typeof value.originalColor !== 'string' ||
    typeof value.originalText !== 'string'
  ) {
    return undefined
  }

  const range = getOffsetRange(value.range)
  if (!range) {
    return undefined
  }

  return {
    delta: value.delta,
    originalColor: value.originalColor,
    originalText: value.originalText,
    range,
  }
}

/**
 * Read and validate a document offset range.
 *
 * @param value - Unknown range payload.
 * @returns Validated offset range, if available.
 */
function getOffsetRange(value: unknown): OffsetRange | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { end, start } = value
  if (typeof start !== 'number' || typeof end !== 'number') {
    return undefined
  }

  const range = { end, start }
  return isValidOffsetRange(range) ? range : undefined
}

/**
 * Check whether an offset range is ordered and finite.
 *
 * @param range - Offset range to validate.
 * @returns Whether the range can be used to build a VS Code range.
 */
function isValidOffsetRange(range: OffsetRange): boolean {
  return (
    Number.isFinite(range.start) &&
    Number.isFinite(range.end) &&
    range.start >= 0 &&
    range.end >= range.start
  )
}

/**
 * Check whether a value is a plain object-like record.
 *
 * @param value - Unknown value.
 * @returns Whether the value can be indexed as a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
