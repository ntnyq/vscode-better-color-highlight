import { collectCssVarDeclarations } from '../css-vars/parser'
import type { CssVarDeclaration } from '../css-vars/parser'
import type { TailwindSourceRange, TailwindRangedValue } from './types'

export interface TailwindThemeDeclaration extends TailwindRangedValue {
  readonly inline: boolean
  readonly name: string
  readonly nameRange: TailwindSourceRange
  readonly static: boolean
}

export interface TailwindThemeDirective {
  readonly kind: 'import' | 'reference'
  readonly range: TailwindSourceRange
  readonly specifier: string
  readonly specifierRange: TailwindSourceRange
}

export interface ParsedTailwindThemeSource {
  readonly customProperties: readonly CssVarDeclaration[]
  readonly directives: readonly TailwindThemeDirective[]
  readonly filePath?: string
  readonly hasV4Signal: boolean
  readonly themeDeclarations: readonly TailwindThemeDeclaration[]
}

interface ThemeBlock {
  readonly bodyEnd: number
  readonly bodyStart: number
  readonly inline: boolean
  readonly range: TailwindSourceRange
  readonly static: boolean
}

interface ScanBoundary {
  readonly kind: 'block' | 'statement' | 'unterminated'
  readonly offset: number
}

interface RangedSpecifier {
  readonly end: number
  readonly specifier: string
  readonly start: number
}

interface MarkupTag {
  readonly closing: boolean
  readonly end: number
  readonly name: string
  readonly selfClosing: boolean
}

const CUSTOM_PROPERTY_NAME_REGEX = /^--(?:\*|color-\*|[-\w]+)$/u
const EMBEDDED_STYLE_FILE_REGEX = /\.(?:astro|html?|svelte|vue)$/iu
const RAW_TEXT_ELEMENT_NAMES = new Set([
  'iframe',
  'noembed',
  'noframes',
  'script',
  'textarea',
  'title',
  'xmp',
])

/** Whether a file can contain CSS inside markup-style `<style>` elements. */
export function isEmbeddedStyleFilePath(filePath: string): boolean {
  return EMBEDDED_STYLE_FILE_REGEX.test(filePath)
}

/** Parse the Tailwind theme constructs in one stylesheet source. */
export function parseTailwindThemeSource(
  text: string,
  filePath?: string,
): ParsedTailwindThemeSource {
  if (
    filePath &&
    isEmbeddedStyleFilePath(filePath) &&
    /<style(?:\s|>)/iu.test(text)
  ) {
    const styleElements = findStyleElementContents(text)
    if (styleElements.length > 0) {
      return mergeEmbeddedStyleSources(text, styleElements, filePath)
    }
  }

  return parseTailwindCssSource(text, filePath)
}

function parseTailwindCssSource(
  text: string,
  filePath?: string,
): ParsedTailwindThemeSource {
  const directives: TailwindThemeDirective[] = []
  const themeBlocks: ThemeBlock[] = []
  let hasV4Signal = false
  let cursor = 0

  while (cursor < text.length) {
    cursor = skipCssTrivia(text, cursor)
    if (cursor >= text.length) {
      break
    }

    const boundary = findTopLevelBoundary(text, cursor)
    if (text[cursor] === '@') {
      const preludeEnd = boundary.offset
      const prelude = text.slice(cursor, preludeEnd)
      const themeForm = parseThemePrelude(prelude)

      if (themeForm && boundary.kind === 'block') {
        const close = findMatchingBrace(text, boundary.offset)
        if (close === -1) {
          break
        }
        themeBlocks.push({
          bodyStart: boundary.offset + 1,
          bodyEnd: close,
          inline: themeForm === 'inline',
          static: themeForm === 'static',
          range: { start: cursor, end: close + 1 },
        })
        hasV4Signal = true
        cursor = close + 1
        continue
      }

      if (boundary.kind === 'statement') {
        const directive = parseDirective(text, cursor, boundary.offset)
        if (directive) {
          directives.push(directive)
          hasV4Signal ||=
            directive.kind === 'reference' ||
            (directive.kind === 'import' &&
              directive.specifier === 'tailwindcss')
        }
      }
    }

    if (boundary.kind === 'block') {
      const close = findMatchingBrace(text, boundary.offset)
      cursor = close === -1 ? text.length : close + 1
    } else {
      cursor = Math.min(boundary.offset + 1, text.length)
    }
  }

  const themeDeclarations = themeBlocks.flatMap(block =>
    scanThemeDeclarations(text, block, filePath),
  )
  const customProperties = collectCssVarDeclarations(text, {
    filePath,
    includeTopLevelDeclarations: true,
    trustedSelectors: [],
  })
    .map(declaration => restoreCustomPropertyValue(text, declaration))
    .filter(
      declaration =>
        !themeBlocks.some(
          block =>
            declaration.nameRange.start >= block.range.start &&
            declaration.nameRange.end <= block.range.end,
        ),
    )

  return {
    customProperties,
    directives,
    filePath,
    hasV4Signal,
    themeDeclarations,
  }
}

function findStyleElementContents(
  text: string,
): readonly TailwindSourceRange[] {
  const ranges: TailwindSourceRange[] = []
  let hasMarkupContext = false
  let cursor = 0

  while (cursor < text.length) {
    const decoyEnd = skipMarkupDecoy(text, cursor, !hasMarkupContext)
    if (decoyEnd !== null) {
      cursor = decoyEnd
      continue
    }
    if (text[cursor] !== '<') {
      cursor++
      continue
    }

    const tag = readMarkupTag(text, cursor)
    if (!tag) {
      cursor++
      continue
    }
    hasMarkupContext = true
    cursor = tag.end
    if (tag.closing || tag.selfClosing) {
      continue
    }

    if (tag.name === 'style' || RAW_TEXT_ELEMENT_NAMES.has(tag.name)) {
      const close = findRawTextElementClose(text, tag.end, tag.name)
      if (!close) {
        break
      }
      if (tag.name === 'style') {
        ranges.push({ start: tag.end, end: close.start })
      }
      cursor = close.end
    }
  }

  return ranges
}

function skipMarkupDecoy(
  text: string,
  cursor: number,
  allowSourceString: boolean,
): number | null {
  const char = text[cursor]
  if (
    allowSourceString &&
    (char === '"' || char === "'" || char === '`') &&
    isSourceStringStart(text, cursor)
  ) {
    return skipSourceString(text, cursor, char)
  }
  if (text.startsWith('/*', cursor)) {
    const end = text.indexOf('*/', cursor + '/*'.length)
    return end === -1 ? text.length : end + '*/'.length
  }
  if (text.startsWith('//', cursor) && text[cursor - 1] !== ':') {
    const end = text.indexOf('\n', cursor + '//'.length)
    return end === -1 ? text.length : end + 1
  }
  if (text.startsWith('<!--', cursor)) {
    const end = text.indexOf('-->', cursor + '<!--'.length)
    return end === -1 ? text.length : end + '-->'.length
  }
  if (char === '<' && (text[cursor + 1] === '!' || text[cursor + 1] === '?')) {
    const end = findMarkupTagEnd(text, cursor + 2)
    return end === -1 ? text.length : end
  }
  return null
}

function isSourceStringStart(text: string, start: number): boolean {
  let cursor = start - 1
  while (cursor >= 0 && /\s/u.test(text[cursor])) {
    cursor--
  }
  return cursor >= 0 && /[!([{,:=?]/u.test(text[cursor])
}

function skipSourceString(
  text: string,
  start: number,
  quote: '"' | "'" | '`',
): number {
  for (let cursor = start + 1; cursor < text.length; cursor++) {
    if (text[cursor] === '\\') {
      cursor++
    } else if (text[cursor] === quote) {
      return cursor + 1
    } else if (quote !== '`' && text[cursor] === '\n') {
      return cursor + 1
    }
  }
  return text.length
}

function readMarkupTag(text: string, start: number): MarkupTag | null {
  let cursor = start + 1
  const closing = text[cursor] === '/'
  if (closing) {
    cursor++
  }
  const nameStart = cursor
  if (!isAsciiLetter(text[cursor])) {
    return null
  }
  cursor++
  while (isMarkupNameChar(text[cursor])) {
    cursor++
  }
  if (!/[\s/>]/u.test(text[cursor] ?? '')) {
    return null
  }

  const end = findMarkupTagEnd(text, cursor)
  if (end === -1) {
    return null
  }
  let marker = end - 2
  while (marker >= cursor && /\s/u.test(text[marker])) {
    marker--
  }

  return {
    closing,
    end,
    name: text.slice(nameStart, cursor).toLowerCase(),
    selfClosing: text[marker] === '/',
  }
}

function findRawTextElementClose(
  text: string,
  start: number,
  name: string,
): TailwindSourceRange | null {
  for (let cursor = start; cursor < text.length; cursor++) {
    if (
      text[cursor] !== '<' ||
      text[cursor + 1] !== '/' ||
      !matchesAsciiCaseInsensitive(text, cursor + 2, name)
    ) {
      continue
    }
    const nameEnd = cursor + 2 + name.length
    if (!/[\s>]/u.test(text[nameEnd] ?? '')) {
      continue
    }
    const end = findMarkupTagEnd(text, nameEnd)
    if (end !== -1) {
      return { start: cursor, end }
    }
  }
  return null
}

function matchesAsciiCaseInsensitive(
  text: string,
  start: number,
  expected: string,
): boolean {
  for (let index = 0; index < expected.length; index++) {
    if (text[start + index]?.toLowerCase() !== expected[index]) {
      return false
    }
  }
  return true
}

function isAsciiLetter(char: string | undefined): boolean {
  return char !== undefined && /[a-z]/iu.test(char)
}

function isMarkupNameChar(char: string | undefined): boolean {
  return char !== undefined && /[\w:-]/u.test(char)
}

function findMarkupTagEnd(text: string, start: number): number {
  let quote: '"' | "'" | undefined
  for (let cursor = start; cursor < text.length; cursor++) {
    const char = text[cursor]
    if (quote) {
      if (char === quote) {
        quote = undefined
      }
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return cursor + 1
    }
  }
  return -1
}

function mergeEmbeddedStyleSources(
  text: string,
  ranges: readonly TailwindSourceRange[],
  filePath?: string,
): ParsedTailwindThemeSource {
  const sources = ranges.map(range => ({
    offset: range.start,
    source: parseTailwindCssSource(
      text.slice(range.start, range.end),
      filePath,
    ),
  }))
  let sourceOrder = 0

  return {
    customProperties: sources.flatMap(({ offset, source }) =>
      source.customProperties.map(declaration => ({
        ...declaration,
        sourceOrder: sourceOrder++,
        nameRange: shiftRange(declaration.nameRange, offset),
        valueRange: shiftRange(declaration.valueRange, offset),
      })),
    ),
    directives: sources.flatMap(({ offset, source }) =>
      source.directives.map(directive => ({
        ...directive,
        range: shiftRange(directive.range, offset),
        specifierRange: shiftRange(directive.specifierRange, offset),
      })),
    ),
    filePath,
    hasV4Signal: sources.some(({ source }) => source.hasV4Signal),
    themeDeclarations: sources.flatMap(({ offset, source }) =>
      source.themeDeclarations.map(declaration => ({
        ...declaration,
        range: shiftRange(declaration.range, offset),
        nameRange: shiftRange(declaration.nameRange, offset),
        valueRange: shiftRange(declaration.valueRange, offset),
      })),
    ),
  }
}

function shiftRange(
  range: TailwindSourceRange,
  offset: number,
): TailwindSourceRange {
  return { start: range.start + offset, end: range.end + offset }
}

function parseThemePrelude(
  prelude: string,
): 'default' | 'inline' | 'static' | null {
  const normalized = stripComments(prelude).replaceAll(/\s+/gu, ' ').trim()
  if (normalized === '@theme') {
    return 'default'
  }
  if (normalized === '@theme inline') {
    return 'inline'
  }
  if (normalized === '@theme static') {
    return 'static'
  }
  return null
}

function parseDirective(
  text: string,
  start: number,
  semicolon: number,
): TailwindThemeDirective | null {
  const statement = text.slice(start, semicolon)
  const match = /^@(?<kind>import|reference)\s+(?<target>[\s\S]*)$/u.exec(
    statement,
  )
  const kind = match?.groups?.kind
  const target = match?.groups?.target
  const rangedSpecifier = target && readDirectiveSpecifier(target)
  if (!kind || !target || !rangedSpecifier) {
    return null
  }

  const targetStart = start + statement.length - target.length
  return {
    kind: kind as TailwindThemeDirective['kind'],
    range: { start, end: semicolon + 1 },
    specifier: rangedSpecifier.specifier,
    specifierRange: {
      start: targetStart + rangedSpecifier.start,
      end: targetStart + rangedSpecifier.end,
    },
  }
}

function readDirectiveSpecifier(target: string): RangedSpecifier | null {
  const trimmed = target.trimStart()
  const leadingWhitespace = target.length - trimmed.length
  const quote = trimmed[0]
  if (quote === '"' || quote === "'") {
    const end = findQuoteEnd(trimmed, 0, quote)
    return end === -1
      ? null
      : {
          start: leadingWhitespace + 1,
          end: leadingWhitespace + end,
          specifier: trimmed.slice(1, end),
        }
  }
  if (!trimmed.startsWith('url(')) {
    return null
  }

  let valueStart = 4
  while (/\s/u.test(trimmed[valueStart])) {
    valueStart++
  }
  const valueQuote = trimmed[valueStart]
  if (valueQuote === '"' || valueQuote === "'") {
    const end = findQuoteEnd(trimmed, valueStart, valueQuote)
    if (end === -1 || !/^\s*\)/u.test(trimmed.slice(end + 1))) {
      return null
    }
    return {
      start: leadingWhitespace + valueStart + 1,
      end: leadingWhitespace + end,
      specifier: trimmed.slice(valueStart + 1, end),
    }
  }

  const close = trimmed.indexOf(')', valueStart)
  if (close === -1) {
    return null
  }
  let valueEnd = close
  while (valueEnd > valueStart && /\s/u.test(trimmed[valueEnd - 1])) {
    valueEnd--
  }
  return valueEnd === valueStart
    ? null
    : {
        start: leadingWhitespace + valueStart,
        end: leadingWhitespace + valueEnd,
        specifier: trimmed.slice(valueStart, valueEnd),
      }
}

function findQuoteEnd(text: string, start: number, quote: '"' | "'"): number {
  for (let cursor = start + 1; cursor < text.length; cursor++) {
    if (text[cursor] === '\\') {
      cursor++
    } else if (text[cursor] === quote) {
      return cursor
    }
  }
  return -1
}

function scanThemeDeclarations(
  text: string,
  block: ThemeBlock,
  filePath?: string,
): TailwindThemeDeclaration[] {
  const declarations: TailwindThemeDeclaration[] = []
  let segmentStart = block.bodyStart
  let colon = -1
  let cursor = block.bodyStart
  let parenDepth = 0

  const commit = (end: number) => {
    if (colon === -1) {
      segmentStart = end + 1
      return
    }
    const rawName = text.slice(segmentStart, colon)
    const rawValue = text.slice(colon + 1, end)
    const name = stripComments(rawName).trim()
    const value = rawValue.trim()
    if (!CUSTOM_PROPERTY_NAME_REGEX.test(name) || !value) {
      segmentStart = end + 1
      colon = -1
      return
    }

    const nameOffset = skipCssTrivia(rawName, 0)
    const valueOffset = rawValue.indexOf(value)
    const nameStart = segmentStart + nameOffset
    const valueStart = colon + 1 + valueOffset
    const nameRange = { start: nameStart, end: nameStart + name.length }
    const valueRange = { start: valueStart, end: valueStart + value.length }
    declarations.push({
      filePath,
      inline: block.inline,
      name,
      nameRange,
      range: { start: nameRange.start, end: valueRange.end },
      static: block.static,
      value,
      valueRange,
    })
    segmentStart = end + 1
    colon = -1
  }

  while (cursor < block.bodyEnd) {
    const next = skipCommentOrString(text, cursor)
    if (next !== cursor) {
      cursor = next
      continue
    }

    const char = text[cursor]
    if (char === '(') {
      parenDepth++
    } else if (char === ')' && parenDepth > 0) {
      parenDepth--
    } else if (parenDepth === 0 && char === '{') {
      const close = findMatchingBrace(text, cursor)
      cursor = close === -1 ? block.bodyEnd : close + 1
      segmentStart = cursor
      colon = -1
      continue
    } else if (parenDepth === 0 && char === ':' && colon === -1) {
      colon = cursor
    } else if (parenDepth === 0 && char === ';') {
      commit(cursor)
    }
    cursor++
  }
  commit(block.bodyEnd)
  return declarations
}

function restoreCustomPropertyValue(
  text: string,
  declaration: CssVarDeclaration,
): CssVarDeclaration {
  let colon = declaration.nameRange.end
  while (colon < text.length) {
    const next = skipCommentOrString(text, colon)
    if (next !== colon) {
      colon = next
      continue
    }
    if (text[colon] === ':') {
      break
    }
    colon++
  }
  if (text[colon] !== ':') {
    return declaration
  }

  const end = findDeclarationValueEnd(text, colon + 1)
  let valueStart = colon + 1
  let valueEnd = end
  while (valueStart < valueEnd && /\s/u.test(text[valueStart])) {
    valueStart++
  }
  while (valueEnd > valueStart && /\s/u.test(text[valueEnd - 1])) {
    valueEnd--
  }
  return {
    ...declaration,
    value: text.slice(valueStart, valueEnd),
    valueRange: { start: valueStart, end: valueEnd },
  }
}

function findDeclarationValueEnd(text: string, start: number): number {
  let parenDepth = 0
  for (let cursor = start; cursor < text.length; cursor++) {
    const next = skipCommentOrString(text, cursor)
    if (next !== cursor) {
      cursor = next - 1
      continue
    }
    const char = text[cursor]
    if (char === '(') {
      parenDepth++
    } else if (char === ')' && parenDepth > 0) {
      parenDepth--
    } else if (parenDepth === 0 && (char === ';' || char === '}')) {
      return cursor
    }
  }
  return text.length
}

function findTopLevelBoundary(text: string, start: number): ScanBoundary {
  let parenDepth = 0
  for (let cursor = start; cursor < text.length; cursor++) {
    const next = skipCommentOrString(text, cursor)
    if (next !== cursor) {
      cursor = next - 1
      continue
    }
    const char = text[cursor]
    if (char === '(') {
      parenDepth++
    } else if (char === ')' && parenDepth > 0) {
      parenDepth--
    } else if (parenDepth === 0 && char === '{') {
      return { kind: 'block', offset: cursor }
    } else if (parenDepth === 0 && char === ';') {
      return { kind: 'statement', offset: cursor }
    }
  }
  return { kind: 'unterminated', offset: text.length }
}

function findMatchingBrace(text: string, open: number): number {
  let depth = 1
  for (let cursor = open + 1; cursor < text.length; cursor++) {
    const next = skipCommentOrString(text, cursor)
    if (next !== cursor) {
      cursor = next - 1
      continue
    }
    if (text[cursor] === '{') {
      depth++
    } else if (text[cursor] === '}' && --depth === 0) {
      return cursor
    }
  }
  return -1
}

function skipCssTrivia(text: string, start: number): number {
  let cursor = start
  while (cursor < text.length) {
    if (/\s/u.test(text[cursor])) {
      cursor++
      continue
    }
    if (text[cursor] === '/' && text[cursor + 1] === '*') {
      const end = text.indexOf('*/', cursor + 2)
      cursor = end === -1 ? text.length : end + 2
      continue
    }
    break
  }
  return cursor
}

function skipCommentOrString(text: string, start: number): number {
  if (text[start] === '/' && text[start + 1] === '*') {
    const end = text.indexOf('*/', start + 2)
    return end === -1 ? text.length : end + 2
  }
  const quote = text[start]
  if (quote !== '"' && quote !== "'") {
    return start
  }
  for (let cursor = start + 1; cursor < text.length; cursor++) {
    if (text[cursor] === '\\') {
      cursor++
    } else if (text[cursor] === quote) {
      return cursor + 1
    }
  }
  return text.length
}

function stripComments(value: string): string {
  return value.replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
}
