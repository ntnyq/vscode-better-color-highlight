export interface CssVarDeclaration {
  readonly name: string
  readonly value: string
  readonly selector: string
  readonly normalizedSelector: string
  readonly specificity: readonly [number, number, number]
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

export function normalizeCssSelector(selector: string): string {
  return stripCssComments(selector).replaceAll(/\s+/gu, ' ').trim()
}

export function splitCssSelectorList(selector: string): string[] {
  const selectors: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let isEscaped = false
  let bracketDepth = 0
  let parenDepth = 0

  for (let index = 0; index < selector.length; index++) {
    const char = selector[index]
    const next = selector[index + 1]

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
      const end = selector.indexOf('*/', index + 2)
      index = end === -1 ? selector.length : end + 1
      current += ' '
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }

    if (char === '[') bracketDepth++
    if (char === ']' && bracketDepth > 0) bracketDepth--
    if (char === '(') parenDepth++
    if (char === ')' && parenDepth > 0) parenDepth--

    if (char === ',' && bracketDepth === 0 && parenDepth === 0) {
      const normalized = normalizeCssSelector(current)
      if (normalized) {
        selectors.push(normalized)
      }
      current = ''
      continue
    }

    current += char
  }

  const normalized = normalizeCssSelector(current)
  if (normalized) {
    selectors.push(normalized)
  }

  return selectors
}

export function isTrustedCssVarSelector(
  selector: string,
  trustedSelectors: readonly string[],
): boolean {
  const trusted = new Set(trustedSelectors.map(normalizeCssSelector))
  const items = splitCssSelectorList(selector)
  return items.length > 0 && items.every(item => trusted.has(item))
}

export function getCssSelectorSpecificity(
  selector: string,
): readonly [number, number, number] {
  const normalized = normalizeCssSelector(selector)
  const idCount = (normalized.match(/#[\w-]+/gu) ?? []).length
  const classLikeCount = (
    normalized.match(/(?:\.[\w-]+|\[[^\]]+\]|:[\w-]+)/gu) ?? []
  ).length
  const withoutClassLike = normalized
    .replaceAll(/#[\w-]+/gu, ' ')
    .replaceAll(/(?:\.[\w-]+|\[[^\]]+\]|:[\w-]+)/gu, ' ')
  const typeCount = (withoutClassLike.match(/\b[a-zA-Z][\w-]*\b/gu) ?? [])
    .length

  return [idCount, classLikeCount, typeCount]
}

export function compareCssSpecificity(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < 3; index++) {
    const diff = left[index] - right[index]
    if (diff !== 0) return diff
  }
  return 0
}

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
  ): void {
    declarations.push({
      ...declaration,
      selector: normalizedSelector,
      normalizedSelector,
      specificity: getCssSelectorSpecificity(normalizedSelector),
      sourceOrder,
      filePath: options.filePath,
      isTrusted: trustedSelectors.has(normalizedSelector),
    })
    sourceOrder++
  }

  function collectTopLevelDeclarations(segment: string): void {
    if (!options.includeTopLevelDeclarations || !topLevelSelector) return

    for (const declaration of scanCssVarDeclarations(segment)) {
      pushDeclaration(declaration, topLevelSelector)
    }
  }

  function walkRange(start: number, end: number): void {
    let blockStart = start

    while (blockStart < end) {
      const openBrace = findNextOpenBrace(text, blockStart, end)
      if (openBrace === -1) {
        collectTopLevelDeclarations(text.slice(blockStart, end))
        return
      }

      const closeBrace = findMatchingCloseBrace(text, openBrace, end)
      if (closeBrace === -1) {
        collectTopLevelDeclarations(text.slice(blockStart, end))
        return
      }

      collectTopLevelDeclarations(text.slice(blockStart, openBrace))

      const prelude = normalizeCssSelector(
        getCssPrelude(text.slice(blockStart, openBrace)),
      )
      const bodyStart = openBrace + 1
      const body = text.slice(bodyStart, closeBrace)

      if (prelude) {
        if (prelude.startsWith('@')) {
          walkRange(bodyStart, closeBrace)
        } else {
          const declarationsInRule = scanCssVarDeclarations(body)
          const selectorItems = splitCssSelectorList(prelude)

          for (const declaration of declarationsInRule) {
            for (const normalizedSelector of selectorItems) {
              pushDeclaration(declaration, normalizedSelector)
            }
          }
        }
      }

      blockStart = closeBrace + 1
    }
  }

  walkRange(0, text.length)

  return declarations
}

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

function stripCssComments(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
}

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

    if (char === '(') parenDepth++
    if (char === ')' && parenDepth > 0) parenDepth--
    if (char === '[') bracketDepth++
    if (char === ']' && bracketDepth > 0) bracketDepth--

    if (char === ';' && parenDepth === 0 && bracketDepth === 0) {
      preludeStart = index + 1
    }
  }

  return text.slice(preludeStart)
}

function findNextOpenBrace(text: string, start: number, end: number): number {
  return scanCssStructuralChar(text, start, end, '{')
}

function findMatchingCloseBrace(
  text: string,
  openBrace: number,
  end: number,
): number {
  let depth = 1
  let index = openBrace + 1

  while (index < end) {
    const nextBrace = scanCssStructuralChar(text, index, end, '{', '}')
    if (nextBrace === -1) return -1

    if (text[nextBrace] === '{') {
      depth++
    } else {
      depth--
      if (depth === 0) return nextBrace
    }

    index = nextBrace + 1
  }

  return -1
}

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
