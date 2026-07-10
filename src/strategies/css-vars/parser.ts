export interface CssVarDeclaration {
  readonly atRuleContext: readonly string[]
  readonly name: string
  readonly value: string
  readonly selector: string
  readonly normalizedSelector: string
  readonly sourceOrder: number
  readonly filePath?: string
  readonly isTrusted: boolean
}

export interface CollectCssVarDeclarationOptions {
  readonly filePath?: string
  readonly trustedSelectors: readonly string[]
  readonly sourceOrderOffset?: number
  readonly includeTopLevelDeclarations?: boolean
  readonly topLevelSelector?: string
}

const CSS_VAR_NAME_REGEX = /^--[-\w]+$/u

interface CssSelectorListScanState {
  current: string
  quote: '"' | "'" | undefined
  isEscaped: boolean
  bracketDepth: number
  parenDepth: number
  selectors: string[]
}

/**
 * Normalize a CSS selector for stable comparison.
 *
 * @param selector - Raw selector text
 * @returns Selector with comments removed and whitespace collapsed
 */
export function normalizeCssSelector(selector: string): string {
  return stripCssComments(selector).replaceAll(/\s+/gu, ' ').trim()
}

/**
 * Split a comma-separated selector list without splitting inside strings,
 * attribute selectors, or function arguments.
 *
 * @param selector - Raw selector list text
 * @returns Normalized selector items
 */
export function splitCssSelectorList(selector: string): string[] {
  const state: CssSelectorListScanState = {
    current: '',
    quote: undefined,
    isEscaped: false,
    bracketDepth: 0,
    parenDepth: 0,
    selectors: [],
  }

  for (let index = 0; index < selector.length; index++) {
    const char = selector[index]

    if (appendQuotedSelectorChar(state, char)) {
      continue
    }

    const commentEnd = findCssCommentEnd(selector, index)
    if (commentEnd !== index) {
      index = commentEnd
      state.current += ' '
      continue
    }

    if (openSelectorQuote(state, char)) {
      continue
    }

    updateSelectorNestingDepth(state, char)

    if (isTopLevelSelectorSeparator(state, char)) {
      commitSelectorItem(state)
      continue
    }

    state.current += char
  }

  commitSelectorItem(state)

  return state.selectors
}

/**
 * Append a character while inside a quoted selector segment.
 *
 * @param state - Mutable selector-list scan state
 * @param char - Current character to process
 * @returns Whether the character was handled as part of a quoted segment
 */
function appendQuotedSelectorChar(
  state: CssSelectorListScanState,
  char: string,
): boolean {
  if (!state.quote) {
    return false
  }

  state.current += char

  if (state.isEscaped) {
    state.isEscaped = false
    return true
  }

  if (char === '\\') {
    state.isEscaped = true
    return true
  }

  if (char === state.quote) {
    state.quote = undefined
  }

  return true
}

/**
 * Find the end of a CSS block comment at the current offset.
 *
 * @param text - Selector source text
 * @param start - Current scan offset
 * @returns Offset of the comment end, or the original offset when no comment starts
 */
function findCssCommentEnd(text: string, start: number): number {
  if (text[start] !== '/' || text[start + 1] !== '*') {
    return start
  }

  const end = text.indexOf('*/', start + 2)
  return end === -1 ? text.length : end + 1
}

/**
 * Open a quoted selector segment when the current character starts one.
 *
 * @param state - Mutable selector-list scan state
 * @param char - Current character to process
 * @returns Whether the current character opened a quote
 */
function openSelectorQuote(
  state: CssSelectorListScanState,
  char: string,
): boolean {
  if (char !== '"' && char !== "'") {
    return false
  }

  state.quote = char
  state.current += char

  return true
}

/**
 * Update bracket and parenthesis nesting depth for selector parsing.
 *
 * @param state - Mutable selector-list scan state
 * @param char - Current character to process
 */
function updateSelectorNestingDepth(
  state: CssSelectorListScanState,
  char: string,
): void {
  if (char === '[') {
    state.bracketDepth++
  }
  if (char === ']' && state.bracketDepth > 0) {
    state.bracketDepth--
  }
  if (char === '(') {
    state.parenDepth++
  }
  if (char === ')' && state.parenDepth > 0) {
    state.parenDepth--
  }
}

/**
 * Check whether a comma separates selector-list items at top level.
 *
 * @param state - Current selector-list scan state
 * @param char - Current character to process
 * @returns Whether the current comma is outside brackets and parentheses
 */
function isTopLevelSelectorSeparator(
  state: CssSelectorListScanState,
  char: string,
): boolean {
  return char === ',' && state.bracketDepth === 0 && state.parenDepth === 0
}

/**
 * Commit the current selector item into the scan result.
 *
 * @param state - Mutable selector-list scan state
 */
function commitSelectorItem(state: CssSelectorListScanState): void {
  const normalized = normalizeCssSelector(state.current)

  if (normalized) {
    state.selectors.push(normalized)
  }

  state.current = ''
}

/**
 * Collect CSS custom property declarations from stylesheet text.
 *
 * @param text - Stylesheet source text
 * @param options - Parser options controlling source metadata and trust
 * @returns Declarations with selector, at-rule, and source-order metadata
 */
export function collectCssVarDeclarations(
  text: string,
  options: CollectCssVarDeclarationOptions,
): CssVarDeclaration[] {
  const declarations: CssVarDeclaration[] = []
  let sourceOrder = options.sourceOrderOffset ?? 0
  const trustedSelectors = new Set(
    options.trustedSelectors.map(normalizeCssSelector),
  )
  const topLevelSelector = normalizeCssSelector(
    options.topLevelSelector ?? ':root',
  )

  function pushDeclaration(
    declaration: Pick<CssVarDeclaration, 'name' | 'value'>,
    normalizedSelector: string,
    atRuleContext: readonly string[],
  ): void {
    declarations.push({
      ...declaration,
      atRuleContext: [...atRuleContext],
      selector: normalizedSelector,
      normalizedSelector,
      sourceOrder,
      filePath: options.filePath,
      isTrusted: trustedSelectors.has(normalizedSelector),
    })
    sourceOrder++
  }

  function collectTopLevelDeclarations(
    segment: string,
    atRuleContext: readonly string[],
  ): void {
    if (!options.includeTopLevelDeclarations || !topLevelSelector) {
      return
    }

    for (const declaration of scanCssVarDeclarations(segment)) {
      pushDeclaration(declaration, topLevelSelector, atRuleContext)
    }
  }

  function collectRuleDeclarations(
    body: string,
    prelude: string,
    atRuleContext: readonly string[],
  ): void {
    const declarationsInRule = scanCssVarDeclarations(body)
    const selectorItems = splitCssSelectorList(prelude)

    for (const declaration of declarationsInRule) {
      for (const normalizedSelector of selectorItems) {
        pushDeclaration(declaration, normalizedSelector, atRuleContext)
      }
    }
  }

  function walkRange(
    start: number,
    end: number,
    atRuleContext: readonly string[] = [],
  ): void {
    let blockStart = start

    while (blockStart < end) {
      const openBrace = findNextOpenBrace(text, blockStart, end)
      if (openBrace === -1) {
        collectTopLevelDeclarations(text.slice(blockStart, end), atRuleContext)
        return
      }

      const closeBrace = findMatchingCloseBrace(text, openBrace, end)
      if (closeBrace === -1) {
        collectTopLevelDeclarations(text.slice(blockStart, end), atRuleContext)
        return
      }

      collectTopLevelDeclarations(
        text.slice(blockStart, openBrace),
        atRuleContext,
      )

      const prelude = normalizeCssSelector(
        getCssPrelude(text.slice(blockStart, openBrace)),
      )
      const bodyStart = openBrace + 1
      const body = text.slice(bodyStart, closeBrace)

      if (prelude) {
        if (prelude.startsWith('@')) {
          walkRange(bodyStart, closeBrace, [...atRuleContext, prelude])
        } else {
          collectRuleDeclarations(body, prelude, atRuleContext)
        }
      }

      blockStart = closeBrace + 1
    }
  }

  walkRange(0, text.length)

  return declarations
}

/**
 * Scan a rule body or declaration segment for custom property declarations.
 *
 * @param body - CSS declaration text
 * @returns Parsed custom property name/value pairs
 */
function scanCssVarDeclarations(
  body: string,
): Pick<CssVarDeclaration, 'name' | 'value'>[] {
  const declarations: Pick<CssVarDeclaration, 'name' | 'value'>[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let isEscaped = false
  let parenDepth = 0
  let blockDepth = 0

  function commit(): void {
    if (blockDepth > 0) {
      current = ''
      return
    }

    const colonIndex = current.indexOf(':')
    if (colonIndex === -1) {
      current = ''
      return
    }

    const name = current.slice(0, colonIndex).trim()
    const value = current.slice(colonIndex + 1).trim()

    if (CSS_VAR_NAME_REGEX.test(name) && value) {
      declarations.push({ name, value })
    }

    current = ''
  }

  for (let index = 0; index < body.length; index++) {
    const char = body[index]
    const next = body[index + 1]

    if (quote) {
      current += char
      if (isEscaped) {
        isEscaped = false
        continue
      }
      if (char === '\\') {
        isEscaped = true
        continue
      }
      if (char === quote) {
        quote = undefined
      }

      continue
    }

    if (char === '/' && next === '*') {
      const end = body.indexOf('*/', index + 2)
      index = end === -1 ? body.length : end + 1
      current += ' '
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }

    if (char === '{') {
      blockDepth++
      current = ''
      continue
    }

    if (char === '}') {
      if (blockDepth > 0) {
        blockDepth--
        current = ''
      }
      continue
    }

    if (blockDepth > 0) {
      continue
    }

    if (char === '(') {
      parenDepth++
    } else if (char === ')' && parenDepth > 0) {
      parenDepth--
    }

    if (char === ';' && parenDepth === 0) {
      commit()
      continue
    }

    current += char
  }

  commit()

  return declarations
}

/**
 * Remove block comments from CSS text.
 *
 * @param text - CSS text segment
 * @returns Text with comments replaced by spaces
 */
function stripCssComments(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
}

/**
 * Extract the selector or at-rule prelude before a block.
 *
 * @param text - Text before an opening brace
 * @returns Prelude text after the last top-level declaration terminator
 */
function getCssPrelude(text: string): string {
  let quote: '"' | "'" | undefined
  let isEscaped = false
  let parenDepth = 0
  let bracketDepth = 0
  let preludeStart = 0

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    const next = text[index + 1]

    if (quote) {
      if (isEscaped) {
        isEscaped = false
        continue
      }
      if (char === '\\') {
        isEscaped = true
        continue
      }
      if (char === quote) {
        quote = undefined
      }

      continue
    }

    if (char === '/' && next === '*') {
      const close = text.indexOf('*/', index + 2)
      index = close === -1 ? text.length : close + 1
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '(') {
      parenDepth++
    }
    if (char === ')' && parenDepth > 0) {
      parenDepth--
    }
    if (char === '[') {
      bracketDepth++
    }
    if (char === ']' && bracketDepth > 0) {
      bracketDepth--
    }

    if (char === ';' && parenDepth === 0 && bracketDepth === 0) {
      preludeStart = index + 1
    }
  }

  return text.slice(preludeStart)
}

/**
 * Find the next structural opening brace outside strings and comments.
 *
 * @param text - Source text
 * @param start - Start offset
 * @param end - End offset
 * @returns Offset of the next opening brace, or -1
 */
function findNextOpenBrace(text: string, start: number, end: number): number {
  return scanCssStructuralChar(text, start, end, '{')
}

/**
 * Find the matching closing brace for an opening brace.
 *
 * @param text - Source text
 * @param openBrace - Offset of the opening brace
 * @param end - End offset for scanning
 * @returns Offset of the matching closing brace, or -1
 */
function findMatchingCloseBrace(
  text: string,
  openBrace: number,
  end: number,
): number {
  let depth = 1
  let index = openBrace + 1

  while (index < end) {
    const nextBrace = scanCssStructuralChar(text, index, end, '{', '}')
    if (nextBrace === -1) {
      return -1
    }

    if (text[nextBrace] === '{') {
      depth++
    } else {
      depth--
      if (depth === 0) {
        return nextBrace
      }
    }

    index = nextBrace + 1
  }

  return -1
}

/**
 * Scan for structural characters while ignoring strings and comments.
 *
 * @param text - Source text
 * @param start - Start offset
 * @param end - End offset
 * @param targets - Characters to find
 * @returns Offset of the first matching target, or -1
 */
function scanCssStructuralChar(
  text: string,
  start: number,
  end: number,
  ...targets: readonly string[]
): number {
  let quote: '"' | "'" | undefined
  let isEscaped = false

  for (let index = start; index < end; index++) {
    const char = text[index]
    const next = text[index + 1]

    if (quote) {
      if (isEscaped) {
        isEscaped = false
        continue
      }
      if (char === '\\') {
        isEscaped = true
        continue
      }
      if (char === quote) {
        quote = undefined
      }

      continue
    }

    if (char === '/' && next === '*') {
      const close = text.indexOf('*/', index + 2)
      index = close === -1 ? end : close + 1
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (targets.includes(char)) {
      return index
    }
  }

  return -1
}
