import type { ColorMatch, StrategyContext } from '../types'
import { findColorFunctions } from './color-functions'
import { findHexRGBA } from './hex'
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

function findLineEnd(text: string, start: number): number {
  const newline = text.indexOf('\n', start)
  const carriageReturn = text.indexOf('\r', start)

  if (newline === -1) return carriageReturn
  if (carriageReturn === -1) return newline

  return Math.min(newline, carriageReturn)
}

function skipWhitespace(text: string, start: number): number {
  let index = start
  while (/\s/u.test(text[index] ?? '')) index++
  return index
}

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

function shouldMatchValue(
  mode: 'token-values' | 'strings' | 'all',
  key: string | undefined,
): boolean {
  if (mode === 'strings' || mode === 'all') return true

  return isTokenValueKey(key)
}

function isTokenValueKey(key: string | undefined): boolean {
  return key === 'value' || key === '$value'
}

function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return raw
  }
}

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

  return [
    ...findHexRGBA(value, context),
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
