import type { ColorMatch, StrategyContext } from '../types'
import { findColorFunctions } from './color-functions'
import { findHexARGB, findHexRGBA } from './hex'
import { findHwb } from './hwb'
import { findNamedColors } from './named-colors'

/**
 * Detect JSON design token color values.
 *
 * @param text - The JSON or JSONC text to scan
 * @param context - Optional strategy context
 * @returns Array of color matches found in design token string values
 */
export function findJsonDesignTokens(
  text: string,
  context?: StrategyContext,
): ColorMatch[] {
  const mode = context?.designTokenJsonMode ?? 'token-values'
  if (mode === 'off') return []

  const matches: ColorMatch[] = []
  let pendingKey: string | undefined
  let pendingKeyHasDelimiter = false

  for (let index = 0; index < text.length; index++) {
    if (text[index] === '/') {
      const commentEnd = skipComment(text, index)
      if (commentEnd !== index) {
        index = commentEnd
        continue
      }
    }

    if (
      shouldClearPendingKey(text[index], pendingKey, pendingKeyHasDelimiter)
    ) {
      pendingKey = undefined
      pendingKeyHasDelimiter = false
    }

    if (pendingKey !== undefined && text[index] === ':') {
      pendingKeyHasDelimiter = true
    }

    if (text[index] !== '"') continue

    const token = readString(text, index)
    if (!token) continue

    const nextIndex = skipWhitespace(text, token.end + 1)
    const isKey = text[nextIndex] === ':'

    if (isKey) {
      pendingKey = token.content
      pendingKeyHasDelimiter = false
      index = token.end
      continue
    }

    if (shouldMatchValue(mode, pendingKey)) {
      matches.push(
        ...findWholeStringColor(token.raw, token.contentStart, context),
      )
    }

    pendingKey = undefined
    pendingKeyHasDelimiter = false
    index = token.end
  }

  return dedupeMatches(matches)
}

interface JsonStringToken {
  readonly content: string
  readonly contentStart: number
  readonly end: number
  readonly raw: string
}

/**
 * Read a JSON string token starting at a quote character.
 *
 * @param text - Full JSON or JSONC source text
 * @param start - Offset of the opening quote
 * @returns Parsed string token, or null when the string is incomplete
 */
function readString(text: string, start: number): JsonStringToken | null {
  let index = start + 1

  while (index < text.length) {
    const char = text[index]

    if (char === '\\') {
      index += 2
      continue
    }

    if (char === '"') {
      const raw = text.slice(start + 1, index)

      return {
        content: decodeJsonString(raw),
        contentStart: start + 1,
        end: index,
        raw,
      }
    }

    index++
  }

  return null
}

/**
 * Skip a JSONC line or block comment.
 *
 * @param text - Full JSON or JSONC source text
 * @param start - Offset of a slash character
 * @returns Offset of the comment end, or the original offset when no comment starts
 */
function skipComment(text: string, start: number): number {
  if (text[start + 1] === '/') {
    const lineEnd = findLineEnd(text, start + 2)
    return lineEnd === -1 ? text.length : lineEnd
  }

  if (text[start + 1] === '*') {
    const blockEnd = text.indexOf('*/', start + 2)
    return blockEnd === -1 ? text.length : blockEnd + 1
  }

  return start
}

/**
 * Find the nearest line terminator from an offset.
 *
 * @param text - Source text to scan
 * @param start - Offset where scanning begins
 * @returns Offset of the next line terminator, or -1 when none exists
 */
function findLineEnd(text: string, start: number): number {
  const newline = text.indexOf('\n', start)
  const carriageReturn = text.indexOf('\r', start)

  if (newline === -1) return carriageReturn
  if (carriageReturn === -1) return newline

  return Math.min(newline, carriageReturn)
}

/**
 * Skip whitespace from a source offset.
 *
 * @param text - Source text to scan
 * @param start - Offset where scanning begins
 * @returns Offset of the first non-whitespace character
 */
function skipWhitespace(text: string, start: number): number {
  let index = start
  while (/\s/u.test(text[index] ?? '')) index++
  return index
}

/**
 * Check whether a pending JSON object key should be cleared.
 *
 * @param char - Current source character
 * @param key - Pending key captured from the last string token
 * @param hasDelimiter - Whether the key delimiter colon has been consumed
 * @returns Whether the pending key is no longer valid for the next value
 */
function shouldClearPendingKey(
  char: string | undefined,
  key: string | undefined,
  hasDelimiter: boolean,
): boolean {
  return (
    key !== undefined &&
    char !== '"' &&
    !(char === ':' && !hasDelimiter) &&
    !/\s/u.test(char ?? '')
  )
}

/**
 * Check whether a JSON string value should be color-matched for a mode.
 *
 * @param mode - JSON design token matching mode
 * @param key - Object key associated with the current value
 * @returns Whether the string value should be scanned for a whole color
 */
function shouldMatchValue(
  mode: 'token-values' | 'strings' | 'all',
  key: string | undefined,
): boolean {
  if (mode === 'strings' || mode === 'all') return true

  return isTokenValueKey(key)
}

/**
 * Check whether a JSON key is a design token value key.
 *
 * @param key - Object key to check
 * @returns Whether the key is value or $value
 */
function isTokenValueKey(key: string | undefined): boolean {
  return key === 'value' || key === '$value'
}

/**
 * Decode JSON string escape sequences best-effort.
 *
 * @param raw - Raw string content without surrounding quotes
 * @returns Decoded string content, or the raw value when decoding fails
 */
function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return raw
  }
}

/**
 * Find colors that occupy an entire JSON string value.
 *
 * @param rawValue - Raw encoded string content without surrounding quotes
 * @param contentStart - Offset of the raw string content in the source text
 * @param context - Optional strategy context
 * @returns Color matches mapped back to the original JSON source range
 */
function findWholeStringColor(
  rawValue: string,
  contentStart: number,
  context?: StrategyContext,
): ColorMatch[] {
  const value = decodeJsonString(rawValue)
  const namedColorContext: StrategyContext = {
    ...context,
    languageId: context?.languageId ?? 'json',
    namedColorMatchMode: 'always',
  }
  const findHex = context?.useARGB ? findHexARGB : findHexRGBA

  return [
    ...findHex(value, context),
    ...findColorFunctions(value),
    ...findHwb(value),
    ...findNamedColors(value, namedColorContext),
  ]
    .filter(match => match.start === 0 && match.end === value.length)
    .map(match => ({
      start: contentStart,
      end: contentStart + rawValue.length,
      color: match.color,
    }))
}

/**
 * Remove duplicate color matches while preserving first-seen order.
 *
 * @param matches - Color matches to deduplicate
 * @returns Deduplicated color matches
 */
function dedupeMatches(matches: ColorMatch[]): ColorMatch[] {
  const seen = new Set<string>()
  const deduped: ColorMatch[] = []

  for (const match of matches) {
    const key = `${match.start}:${match.end}:${match.color}`
    if (seen.has(key)) continue

    seen.add(key)
    deduped.push(match)
  }

  return deduped
}
