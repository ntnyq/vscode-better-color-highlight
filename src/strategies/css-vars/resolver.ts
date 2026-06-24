import type { ColorDetector, ColorMatch } from '../../types'
import { findColorFunctions, resolveShorthandColor } from '../color-functions'
import { findHexRGBA } from '../hex'
import { findHwb } from '../hwb'
import { findNamedColors } from '../named-colors'
import type { CssVarDeclaration } from './parser'

export interface ResolveCssVarMatchOptions {
  readonly currentDeclarations: readonly CssVarDeclaration[]
  readonly externalDeclarations: readonly CssVarDeclaration[]
}

interface VarUsage {
  readonly name: string
  readonly fallback?: string
  readonly start: number
  readonly end: number
}

type CandidateResolution =
  | {
      readonly status: 'found'
      readonly declaration: CssVarDeclaration
    }
  | {
      readonly status: 'missing'
    }
  | {
      readonly status: 'ambiguous'
    }

type CssVarResolution =
  | {
      readonly status: 'resolved'
      readonly color: string
    }
  | {
      readonly status: 'missing'
    }
  | {
      readonly status: 'ambiguous'
    }
  | {
      readonly status: 'invalid'
    }

const MAX_RESOLUTION_DEPTH = 16

/**
 * Resolve CSS custom property usages in document text to highlight colors.
 *
 * @param text - Document text to scan
 * @param options - Current-file and external declaration sets
 * @returns Color matches for resolvable `var(...)` usages
 */
export async function resolveCssVarMatches(
  text: string,
  options: ResolveCssVarMatchOptions,
): Promise<ColorMatch[]> {
  const matches: ColorMatch[] = []

  for (const usage of findCssVarUsages(text)) {
    if (isCssCustomPropertyValueUsage(text, usage)) continue

    const result = await resolveCssVarUsage(usage, options, new Set(), 0, true)
    if (result.status !== 'resolved') continue

    matches.push({
      start: usage.start,
      end: usage.end,
      color: result.color,
    })
  }

  return matches
}

/**
 * Resolve one parsed `var(...)` usage.
 *
 * @param usage - Variable name and optional fallback
 * @param options - Resolver declaration sets
 * @param seen - Variable names already visited in this chain
 * @param depth - Current recursion depth
 * @param canUseInvalidFallback - Whether invalid declarations may use caller fallback
 * @returns Resolution state for the variable usage
 */
async function resolveCssVarUsage(
  usage: Pick<VarUsage, 'name' | 'fallback'>,
  options: ResolveCssVarMatchOptions,
  seen: ReadonlySet<string>,
  depth: number,
  canUseInvalidFallback: boolean,
): Promise<CssVarResolution> {
  if (depth > MAX_RESOLUTION_DEPTH) {
    return canUseInvalidFallback
      ? resolveInvalidFallback(usage, options, seen, depth)
      : { status: 'invalid' }
  }

  if (seen.has(usage.name)) {
    return canUseInvalidFallback
      ? resolveInvalidFallback(usage, options, seen, depth)
      : { status: 'invalid' }
  }

  const candidate = selectCssVarDeclaration(usage.name, options)
  if (candidate.status === 'missing') {
    return resolveFallback(usage, options, seen, depth)
  }
  if (candidate.status === 'ambiguous') return { status: 'ambiguous' }

  const nextSeen = new Set(seen)
  nextSeen.add(usage.name)

  const result = await resolveCssVarValue(
    candidate.declaration.value,
    candidate.declaration.name,
    options,
    nextSeen,
    depth + 1,
  )

  if (result.status !== 'invalid') return result

  if (!canUseInvalidFallback) return { status: 'invalid' }

  return resolveInvalidFallback(usage, options, seen, depth)
}

/**
 * Resolve a normal CSS variable fallback.
 *
 * @param usage - Usage with an optional fallback value
 * @param options - Resolver declaration sets
 * @param seen - Variable names already visited in this chain
 * @param depth - Current recursion depth
 * @returns Resolved fallback color or missing state
 */
async function resolveFallback(
  usage: Pick<VarUsage, 'fallback'>,
  options: ResolveCssVarMatchOptions,
  seen: ReadonlySet<string>,
  depth: number,
): Promise<CssVarResolution> {
  if (!usage.fallback) return { status: 'missing' }

  return await resolveCssVarValue(
    usage.fallback,
    undefined,
    options,
    seen,
    depth + 1,
  )
}

/**
 * Resolve a fallback used after an invalid declaration or cycle.
 *
 * @param usage - Usage with an optional fallback value
 * @param options - Resolver declaration sets
 * @param seen - Variable names already visited in this chain
 * @param depth - Current recursion depth
 * @returns Resolved fallback color or invalid state
 */
async function resolveInvalidFallback(
  usage: Pick<VarUsage, 'fallback'>,
  options: ResolveCssVarMatchOptions,
  seen: ReadonlySet<string>,
  depth: number,
): Promise<CssVarResolution> {
  if (!usage.fallback) return { status: 'invalid' }

  return await resolveCssVarValue(
    usage.fallback,
    undefined,
    options,
    seen,
    depth + 1,
  )
}

/**
 * Resolve a raw custom property value to a color.
 *
 * @param value - Raw custom property or fallback value
 * @param currentName - Current custom property name used for shorthand hints
 * @param options - Resolver declaration sets
 * @param seen - Variable names already visited in this chain
 * @param depth - Current recursion depth
 * @returns Resolution state for the raw value
 */
async function resolveCssVarValue(
  value: string,
  currentName: string | undefined,
  options: ResolveCssVarMatchOptions,
  seen: ReadonlySet<string>,
  depth: number,
): Promise<CssVarResolution> {
  if (depth > MAX_RESOLUTION_DEPTH) return { status: 'invalid' }

  const normalized = value.replaceAll(/!important\b/gu, '').trim()
  const varUsages = findCssVarUsages(normalized)

  if (varUsages.length > 0) {
    const usage = getExactCssVarAlias(normalized, varUsages)
    if (!usage) return { status: 'missing' }

    return await resolveCssVarUsage(usage, options, seen, depth + 1, false)
  }

  const directColor = await resolveDirectColor(normalized)
  if (directColor) {
    return {
      status: 'resolved',
      color: directColor,
    }
  }

  const shorthandColor = resolveShorthandColor(normalized, currentName)
  if (shorthandColor) {
    return {
      status: 'resolved',
      color: shorthandColor,
    }
  }

  return { status: 'missing' }
}

/**
 * Resolve a value that is itself a whole supported color.
 *
 * @param value - Normalized value text
 * @returns Resolved rgb()/rgba() string, or null when value is not a color
 */
async function resolveDirectColor(value: string): Promise<string | null> {
  const strategies: ColorDetector[] = [
    findHexRGBA,
    findColorFunctions,
    findHwb,
    text =>
      findNamedColors(text, {
        languageId: 'css',
        namedColorMatchMode: 'always',
      }),
  ]
  const results = await Promise.all(strategies.map(strategy => strategy(value)))
  const matches = results.flat().sort((left, right) => left.start - right.start)
  const exactMatch = matches.find(
    match => match.start === 0 && match.end === value.length,
  )

  return exactMatch?.color ?? null
}

/**
 * Select the declaration that should satisfy a variable name.
 *
 * @param name - CSS custom property name, including `--`
 * @param options - Resolver declaration sets
 * @returns Candidate selection state
 */
function selectCssVarDeclaration(
  name: string,
  options: ResolveCssVarMatchOptions,
): CandidateResolution {
  const currentCandidates = options.currentDeclarations.filter(
    declaration => declaration.name === name,
  )
  if (currentCandidates.length > 0) {
    let latest = currentCandidates[0]
    for (const declaration of currentCandidates.slice(1)) {
      if (declaration.sourceOrder > latest.sourceOrder) {
        latest = declaration
      }
    }

    return {
      status: 'found',
      declaration: latest,
    }
  }

  const externalCandidates = options.externalDeclarations.filter(
    declaration => declaration.name === name,
  )
  if (externalCandidates.length === 0) {
    return { status: 'missing' }
  }

  if (externalCandidates.some(declaration => !declaration.isTrusted)) {
    return { status: 'ambiguous' }
  }

  const firstSelector = externalCandidates[0].normalizedSelector
  if (
    externalCandidates.some(
      declaration => declaration.normalizedSelector !== firstSelector,
    )
  ) {
    return { status: 'ambiguous' }
  }

  return {
    status: 'found',
    declaration: selectLatestDeclaration(externalCandidates),
  }
}

/**
 * Select the latest declaration by source order.
 *
 * @param declarations - Declarations with the same name and selector context
 * @returns Declaration with the highest source order
 */
function selectLatestDeclaration(
  declarations: readonly CssVarDeclaration[],
): CssVarDeclaration {
  let latest = declarations[0]

  for (const declaration of declarations.slice(1)) {
    if (declaration.sourceOrder > latest.sourceOrder) {
      latest = declaration
    }
  }

  return latest
}

/**
 * Get the usage when a value is exactly one `var(...)` alias.
 *
 * @param value - Normalized value text
 * @param usages - Parsed variable usages in the value
 * @returns The exact alias usage, or null when the value is composite
 */
function getExactCssVarAlias(
  value: string,
  usages: readonly VarUsage[],
): VarUsage | null {
  if (usages.length !== 1) return null

  const usage = usages[0]
  if (value.slice(0, usage.start).trim()) return null
  if (value.slice(usage.end).trim()) return null

  return usage
}

/**
 * Check whether a `var(...)` usage is inside a custom property definition.
 *
 * @param text - Full document text
 * @param usage - Parsed variable usage
 * @returns Whether the usage belongs to a `--name:` declaration value
 */
function isCssCustomPropertyValueUsage(text: string, usage: VarUsage): boolean {
  const declarationStart = Math.max(
    text.lastIndexOf(';', usage.start),
    text.lastIndexOf('{', usage.start),
    text.lastIndexOf('}', usage.start),
  )
  const declarationPrefix = text.slice(declarationStart + 1, usage.start)
  const colonIndex = declarationPrefix.indexOf(':')
  if (colonIndex === -1) return false

  const propertyName = declarationPrefix.slice(0, colonIndex).trim()
  return /^--[-\w]+$/u.test(propertyName)
}

/**
 * Find parseable CSS `var(...)` usages in text.
 *
 * @param text - Text to scan
 * @returns Parsed variable usages with source offsets
 */
function findCssVarUsages(text: string): VarUsage[] {
  const usages: VarUsage[] = []
  let searchStart = 0

  while (searchStart < text.length) {
    const varStart = findNextVarFunction(text, searchStart)
    if (varStart === -1) break

    const openParen = varStart + 'var'.length
    const closeParen = findMatchingParen(text, openParen)
    if (closeParen === -1) {
      searchStart = openParen + 1
      continue
    }

    const content = text.slice(openParen + 1, closeParen)
    const parsed = parseCssVarContent(content)
    if (parsed) {
      usages.push({
        ...parsed,
        start: varStart,
        end: closeParen + 1,
      })
    }

    searchStart = closeParen + 1
  }

  return usages
}

/**
 * Find the next CSS `var(` function start.
 *
 * @param text - Text to scan
 * @param start - Start offset
 * @returns Offset of the next `var(`, or -1
 */
function findNextVarFunction(text: string, start: number): number {
  const regex = /\bvar\s*\(/gu
  regex.lastIndex = start
  const match = regex.exec(text)
  return match?.index ?? -1
}

/**
 * Parse the content inside a CSS `var(...)` call.
 *
 * @param content - Text between the `var(` and matching `)`
 * @returns Parsed variable name and fallback, or null for invalid content
 */
function parseCssVarContent(
  content: string,
): Pick<VarUsage, 'name' | 'fallback'> | null {
  const commaIndex = findTopLevelComma(content)
  const rawName =
    commaIndex === -1 ? content.trim() : content.slice(0, commaIndex).trim()

  if (!/^--[-\w]+$/u.test(rawName)) return null

  const fallback =
    commaIndex === -1 ? undefined : content.slice(commaIndex + 1).trim()

  return {
    name: rawName,
    fallback: fallback || undefined,
  }
}

/**
 * Find the first comma at top level in a `var(...)` argument list.
 *
 * @param text - Argument-list text
 * @returns Comma offset, or -1 when no top-level comma exists
 */
function findTopLevelComma(text: string): number {
  let quote: '"' | "'" | undefined
  let isEscaped = false
  let parenDepth = 0

  for (let index = 0; index < text.length; index++) {
    const char = text[index]

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

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '(') {
      parenDepth++
      continue
    }
    if (char === ')' && parenDepth > 0) {
      parenDepth--
      continue
    }

    if (char === ',' && parenDepth === 0) return index
  }

  return -1
}

/**
 * Find the matching closing parenthesis for an opening parenthesis.
 *
 * @param text - Source text
 * @param openParen - Offset of the opening parenthesis
 * @returns Offset of the matching closing parenthesis, or -1
 */
function findMatchingParen(text: string, openParen: number): number {
  let quote: '"' | "'" | undefined
  let isEscaped = false
  let depth = 1

  for (let index = openParen + 1; index < text.length; index++) {
    const char = text[index]

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

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '(') {
      depth++
      continue
    }
    if (char !== ')') continue

    depth--
    if (depth === 0) return index
  }

  return -1
}
