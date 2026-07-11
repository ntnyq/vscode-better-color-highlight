/* oxlint-disable eslint/complexity -- Host-language lexer states are explicit. */
import type { ContrastRange } from './types'

export const MARKUP_LANGUAGES = new Set([
  'astro',
  'htm',
  'html',
  'javascriptreact',
  'jsx',
  'svelte',
  'typescriptreact',
  'vue',
])

export interface StaticAttribute extends ContrastRange {
  readonly name: string
  readonly valueEnd: number
  readonly valueStart: number
}

export interface StyleRegion extends ContrastRange {
  readonly contextPrefix: 'style'
}

export interface MarkupContexts {
  readonly attributes: readonly StaticAttribute[]
  readonly styles: readonly StyleRegion[]
}

interface JsLikeScanState {
  canStartRegex: boolean
  readonly parenthesisContexts: ParenthesisContext[]
  pendingControlParenthesis:
    | 'control'
    | 'for-await-header'
    | 'for-header'
    | null
  previousSignificantToken: 'member-access' | 'other'
}

interface ForHeaderContext {
  delimiterDepth: number
  hasClassicSemicolon: boolean
  hasLhsToken: boolean
  hasSeparator: boolean
  readonly kind: 'for-header'
}

type ParenthesisContext = 'control' | 'normal' | ForHeaderContext

const FOR_DECLARATION_KEYWORDS = new Set(['const', 'let', 'var'])

const CONTROL_STATEMENT_KEYWORDS = new Set([
  'catch',
  'for',
  'if',
  'switch',
  'while',
  'with',
])

const REGEX_PREFIX_KEYWORDS = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
])

const RAW_TEXT_ELEMENT_NAMES = new Set([
  'iframe',
  'noembed',
  'noframes',
  'script',
  'textarea',
  'title',
  'xmp',
])

export function collectStaticMarkupContexts(
  text: string,
  languageId: string,
): MarkupContexts {
  const attributes: StaticAttribute[] = []
  const styles: StyleRegion[] = []
  const lowerText = text.toLowerCase()
  const isJsx = new Set(['javascriptreact', 'jsx', 'typescriptreact']).has(
    languageId,
  )
  let index = languageId === 'astro' ? findAstroFrontmatterEnd(text) : 0
  const jsxState = createJsLikeScanState()

  while (index < text.length) {
    const char = text[index]

    if (languageId === 'vue' && text.startsWith('{{', index)) {
      index = findHostExpressionEnd(text, index, 'moustache')
      continue
    }
    if ((languageId === 'astro' || languageId === 'svelte') && char === '{') {
      index = findHostExpressionEnd(text, index, 'balanced')
      continue
    }

    if (isJsx && char !== '<') {
      index = skipJsLikeToken(text, index, jsxState)
      continue
    }

    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index + 4)
      index = end === -1 ? text.length : end + 3
      continue
    }
    if (char !== '<') {
      index++
      continue
    }

    const tag = parseTag(text, index, languageId)
    if (typeof tag === 'number') {
      index = tag
      continue
    }
    index = tag.end
    jsxState.canStartRegex = false
    if (tag.isClosing) {
      continue
    }

    const lowerName = tag.name.toLowerCase()
    if (lowerName === 'plaintext') {
      index = text.length
      continue
    }
    if (RAW_TEXT_ELEMENT_NAMES.has(lowerName)) {
      index = findRawElementEnd(text, lowerText, index, lowerName)
      continue
    }
    if (lowerName === 'style') {
      const contentEnd = findRawElementStart(lowerText, index, 'style')
      if (contentEnd !== -1) {
        styles.push({
          contextPrefix: 'style',
          end: contentEnd,
          start: index,
        })
        index = findRawElementEnd(text, lowerText, index, 'style')
      }
      continue
    }
    attributes.push(...tag.attributes)
  }

  return { attributes, styles }
}

function findAstroFrontmatterEnd(text: string): number {
  if (!text.startsWith('---')) {
    return 0
  }
  const openingEnd = findNextLineStart(text, 0)
  if (text.slice(0, openingEnd).trim() !== '---') {
    return 0
  }

  let lineStart = openingEnd
  while (lineStart < text.length) {
    const nextLine = findNextLineStart(text, lineStart)
    if (text.slice(lineStart, nextLine).trim() === '---') {
      return nextLine
    }
    lineStart = nextLine
  }
  return text.length
}

function findNextLineStart(text: string, start: number): number {
  const newline = text.indexOf('\n', start)
  return newline === -1 ? text.length : newline + 1
}

function findHostExpressionEnd(
  text: string,
  start: number,
  kind: 'balanced' | 'moustache',
): number {
  let index = kind === 'moustache' ? start + 2 : start
  let depth = 0
  const state = createJsLikeScanState()

  for (; index < text.length; index++) {
    const char = text[index]
    const next = text[index + 1] ?? ''
    if (kind === 'moustache' && depth === 0 && char === '}' && next === '}') {
      return index + 2
    }
    if (char === '{') {
      recordForHeaderDelimiter(state, char)
      depth++
      state.canStartRegex = true
      state.previousSignificantToken = 'other'
    } else if (char === '}') {
      recordForHeaderDelimiter(state, char)
      depth--
      if (kind === 'balanced' && depth === 0) {
        return index + 1
      }
      state.canStartRegex = false
      state.previousSignificantToken = 'other'
    } else {
      index = skipJsLikeToken(text, index, state) - 1
    }
  }
  return text.length
}

function skipJsLikeToken(
  text: string,
  start: number,
  state: JsLikeScanState,
): number {
  const char = text[start]
  const next = text[start + 1] ?? ''
  if (/\s/u.test(char)) {
    return start + 1
  }
  if (char === '"' || char === "'" || char === '`') {
    state.pendingControlParenthesis = null
    state.canStartRegex = false
    state.previousSignificantToken = 'other'
    return skipQuotedJsLikeText(text, start, char)
  }
  if (char === '/' && next === '/') {
    return findNextLineStart(text, start)
  }
  if (char === '/' && next === '*') {
    const close = text.indexOf('*/', start + 2)
    return close === -1 ? text.length : close + 2
  }
  if (char === '/' && state.canStartRegex) {
    state.pendingControlParenthesis = null
    state.canStartRegex = false
    state.previousSignificantToken = 'other'
    return skipRegexLiteral(text, start)
  }
  if (char === '/') {
    state.pendingControlParenthesis = null
    state.canStartRegex = true
    state.previousSignificantToken = 'other'
    return start + (next === '=' ? 2 : 1)
  }
  if (/[$_a-z]/iu.test(char)) {
    let end = start + 1
    while (end < text.length && /[$\w]/u.test(text[end])) {
      end++
    }
    const identifier = text.slice(start, end)
    const isMemberProperty = state.previousSignificantToken === 'member-access'
    const forHeader = getActiveForHeader(state)
    const pendingControlParenthesis = state.pendingControlParenthesis
    state.pendingControlParenthesis = null
    if (
      !isMemberProperty &&
      identifier === 'await' &&
      pendingControlParenthesis === 'for-header'
    ) {
      state.pendingControlParenthesis = 'for-await-header'
    } else if (
      !isMemberProperty &&
      CONTROL_STATEMENT_KEYWORDS.has(identifier)
    ) {
      state.pendingControlParenthesis =
        identifier === 'for' ? 'for-header' : 'control'
    }
    const isForOfOperator =
      !isMemberProperty &&
      identifier === 'of' &&
      forHeader !== undefined &&
      forHeader.delimiterDepth === 0 &&
      !forHeader.hasClassicSemicolon &&
      forHeader.hasLhsToken &&
      !forHeader.hasSeparator
    if (isForOfOperator) {
      forHeader.hasSeparator = true
    } else if (
      forHeader &&
      !forHeader.hasClassicSemicolon &&
      !forHeader.hasSeparator &&
      !FOR_DECLARATION_KEYWORDS.has(identifier)
    ) {
      forHeader.hasLhsToken = true
    }
    state.canStartRegex =
      (!isMemberProperty && REGEX_PREFIX_KEYWORDS.has(identifier)) ||
      isForOfOperator
    state.previousSignificantToken = 'other'
    return end
  }
  if (/\d/u.test(char)) {
    let end = start + 1
    while (end < text.length && /[.\d_a-fx]/iu.test(text[end])) {
      end++
    }
    state.pendingControlParenthesis = null
    state.canStartRegex = false
    state.previousSignificantToken = 'other'
    return end
  }
  if (char === '.' || (char === '?' && next === '.')) {
    state.pendingControlParenthesis = null
    state.canStartRegex = false
    state.previousSignificantToken = 'member-access'
    return start + (char === '?' ? 2 : 1)
  }
  if (char === '(') {
    const forHeader = getActiveForHeader(state)
    if (forHeader && !forHeader.hasSeparator) {
      forHeader.hasLhsToken = true
    }
    state.parenthesisContexts.push(
      state.pendingControlParenthesis === 'for-header' ||
        state.pendingControlParenthesis === 'for-await-header'
        ? createForHeaderContext()
        : (state.pendingControlParenthesis ?? 'normal'),
    )
    state.pendingControlParenthesis = null
    state.canStartRegex = true
    state.previousSignificantToken = 'other'
    return start + 1
  }
  if (char === ')') {
    const context = state.parenthesisContexts.pop()
    state.canStartRegex = context !== undefined && context !== 'normal'
    state.pendingControlParenthesis = null
    state.previousSignificantToken = 'other'
    return start + 1
  }
  if ((char === '+' || char === '-') && next === char) {
    state.pendingControlParenthesis = null
    state.canStartRegex = false
    state.previousSignificantToken = 'other'
    return start + 2
  }
  const forHeader = getActiveForHeader(state)
  if (forHeader) {
    if (char === ';' && forHeader.delimiterDepth === 0) {
      forHeader.hasClassicSemicolon = true
    } else if (char === '{' || char === '[' || char === '}' || char === ']') {
      recordForHeaderDelimiter(state, char)
    }
  }
  state.pendingControlParenthesis = null
  state.canStartRegex = !/[)\].}]/u.test(char)
  state.previousSignificantToken = 'other'
  return start + 1
}

function createForHeaderContext(): ForHeaderContext {
  return {
    delimiterDepth: 0,
    hasClassicSemicolon: false,
    hasLhsToken: false,
    hasSeparator: false,
    kind: 'for-header',
  }
}

function getActiveForHeader(
  state: JsLikeScanState,
): ForHeaderContext | undefined {
  const context = state.parenthesisContexts.at(-1)
  return typeof context === 'object' ? context : undefined
}

function recordForHeaderDelimiter(
  state: JsLikeScanState,
  delimiter: string,
): void {
  const context = getActiveForHeader(state)
  if (!context) {
    return
  }
  if (delimiter === '{' || delimiter === '[') {
    if (!context.hasSeparator) {
      context.hasLhsToken = true
    }
    context.delimiterDepth++
  } else {
    context.delimiterDepth = Math.max(0, context.delimiterDepth - 1)
  }
}

function createJsLikeScanState(): JsLikeScanState {
  return {
    canStartRegex: true,
    parenthesisContexts: [],
    pendingControlParenthesis: null,
    previousSignificantToken: 'other',
  }
}

function skipQuotedJsLikeText(
  text: string,
  start: number,
  quote: string,
): number {
  let escaped = false
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index]
    if (escaped) {
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (char === quote) {
      return index + 1
    }
  }
  return text.length
}

function skipRegexLiteral(text: string, start: number): number {
  let escaped = false
  let inCharacterClass = false
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index]
    if (escaped) {
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (char === '[') {
      inCharacterClass = true
    } else if (char === ']' && inCharacterClass) {
      inCharacterClass = false
    } else if (char === '/' && !inCharacterClass) {
      let end = index + 1
      while (end < text.length && /[a-z]/iu.test(text[end])) {
        end++
      }
      return end
    } else if (char === '\n' || char === '\r') {
      return text.length
    }
  }
  return text.length
}

interface ParsedTag {
  readonly attributes: readonly StaticAttribute[]
  readonly end: number
  readonly isClosing: boolean
  readonly name: string
}

function parseTag(
  text: string,
  start: number,
  languageId: string,
): ParsedTag | number {
  let index = start + 1
  const isClosing = text[index] === '/'
  if (isClosing) {
    index++
  }
  const nameStart = index
  while (index < text.length && /[-\w:]/u.test(text[index])) {
    index++
  }
  if (index === nameStart) {
    return start + 1
  }
  const name = text.slice(nameStart, index)
  const attributes: StaticAttribute[] = []
  const supportsHostExpressions = [
    'astro',
    'javascriptreact',
    'jsx',
    'svelte',
    'typescriptreact',
  ].includes(languageId)

  while (index < text.length) {
    while (/\s/u.test(text[index])) {
      index++
    }
    if (text[index] === '>') {
      return { attributes, end: index + 1, isClosing, name }
    }
    if (text[index] === '/' && text[index + 1] === '>') {
      return { attributes, end: index + 2, isClosing, name }
    }
    if (supportsHostExpressions && text[index] === '{') {
      index = findHostExpressionEnd(text, index, 'balanced')
      continue
    }
    const attributeStart = index
    while (index < text.length && /[^\s=/>]/u.test(text[index])) {
      index++
    }
    if (index === attributeStart) {
      return findTagRecoveryEnd(text, index)
    }
    const attributeName = text.slice(attributeStart, index).toLowerCase()
    while (/\s/u.test(text[index])) {
      index++
    }
    if (text[index] !== '=') {
      continue
    }
    index++
    while (/\s/u.test(text[index])) {
      index++
    }
    const quote = text[index]
    if (supportsHostExpressions && quote === '{') {
      index = findHostExpressionEnd(text, index, 'balanced')
      continue
    }
    if (quote !== '"' && quote !== "'") {
      while (index < text.length && /[^\s>]/u.test(text[index])) {
        index++
      }
      continue
    }
    const valueStart = ++index
    while (index < text.length && text[index] !== quote) {
      index += text[index] === '\\' ? 2 : 1
    }
    if (index >= text.length) {
      return text.length
    }
    attributes.push({
      end: index + 1,
      name: attributeName,
      start: attributeStart,
      valueEnd: index,
      valueStart,
    })
    index++
  }
  return text.length
}

function findTagRecoveryEnd(text: string, start: number): number {
  const end = text.indexOf('>', start)
  return end === -1 ? text.length : end + 1
}

function findRawElementStart(
  lowerText: string,
  start: number,
  name: string,
): number {
  const marker = `</${name}`
  let candidate = lowerText.indexOf(marker, start)
  while (candidate !== -1) {
    let boundary = candidate + marker.length
    while (boundary < lowerText.length && /\s/u.test(lowerText[boundary])) {
      boundary++
    }
    if (lowerText[boundary] === '>') {
      return candidate
    }
    candidate = lowerText.indexOf(marker, boundary)
  }
  return -1
}

function findRawElementEnd(
  text: string,
  lowerText: string,
  start: number,
  name: string,
): number {
  const closeStart = findRawElementStart(lowerText, start, name)
  if (closeStart === -1) {
    return text.length
  }
  const closeEnd = text.indexOf('>', closeStart + name.length + 2)
  return closeEnd === -1 ? text.length : closeEnd + 1
}
