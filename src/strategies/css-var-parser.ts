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
}

const CSS_RULE_REGEX =
  /(?<selector>[^{}]+)\{(?<body>[^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gu

const CSS_VAR_DEF_REGEX = /(?<name>--[-\w]+)\s*:\s*(?<value>[^;]+?)\s*;/gu

export function normalizeCssSelector(selector: string): string {
  return selector.replaceAll(/\s+/gu, ' ').trim()
}

export function splitCssSelectorList(selector: string): string[] {
  return selector
    .split(',')
    .map(item => normalizeCssSelector(item))
    .filter(Boolean)
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

  for (const rule of text.matchAll(CSS_RULE_REGEX)) {
    const selector = rule.groups?.selector
    const body = rule.groups?.body
    if (!selector || !body) continue

    const normalizedSelector = normalizeCssSelector(selector)
    const isTrusted = isTrustedCssVarSelector(
      normalizedSelector,
      options.trustedSelectors,
    )
    const specificity = getCssSelectorSpecificity(normalizedSelector)

    for (const declaration of body.matchAll(CSS_VAR_DEF_REGEX)) {
      const name = declaration.groups?.name
      const value = declaration.groups?.value?.trim()
      if (!name || !value) continue

      declarations.push({
        name,
        value,
        selector: normalizedSelector,
        normalizedSelector,
        specificity,
        sourceOrder,
        filePath: options.filePath,
        isTrusted,
      })
      sourceOrder++
    }
  }

  for (const declaration of text.matchAll(CSS_VAR_DEF_REGEX)) {
    const index = declaration.index ?? 0
    const before = text.lastIndexOf('{', index)
    const after = text.lastIndexOf('}', index)
    if (before > after) continue

    const name = declaration.groups?.name
    const value = declaration.groups?.value?.trim()
    if (!name || !value) continue

    declarations.push({
      name,
      value,
      selector: ':root',
      normalizedSelector: ':root',
      specificity: [0, 1, 0],
      sourceOrder,
      filePath: options.filePath,
      isTrusted: isTrustedCssVarSelector(':root', options.trustedSelectors),
    })
    sourceOrder++
  }

  return declarations
}
