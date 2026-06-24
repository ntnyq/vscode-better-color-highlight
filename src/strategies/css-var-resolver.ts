import type { ColorDetector, ColorMatch } from '../types'
import { findColorFunctions, resolveShorthandColor } from './color-functions'
import type { CssVarDeclaration } from './css-var-parser'
import { compareCssSpecificity } from './css-var-parser'
import { findHexRGBA } from './hex'
import { findHwb } from './hwb'
import { findNamedColors } from './named-colors'

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
    for (const usage of varUsages) {
      const result = await resolveCssVarUsage(
        usage,
        options,
        seen,
        depth + 1,
        false,
      )
      if (result.status !== 'missing') return result
    }
    return { status: 'missing' }
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

  return matches[0]?.color ?? null
}

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

  const sortedCandidates = [...externalCandidates].sort(
    compareCssVarDeclarations,
  )
  const winner = sortedCandidates.at(-1)
  const runnerUp = sortedCandidates.at(-2)
  if (!winner) {
    return { status: 'missing' }
  }
  if (runnerUp && compareCssVarDeclarations(winner, runnerUp) === 0) {
    return { status: 'ambiguous' }
  }

  return {
    status: 'found',
    declaration: winner,
  }
}

function compareCssVarDeclarations(
  left: CssVarDeclaration,
  right: CssVarDeclaration,
): number {
  const specificityDiff = compareCssSpecificity(
    left.specificity,
    right.specificity,
  )
  if (specificityDiff !== 0) return specificityDiff

  return left.sourceOrder - right.sourceOrder
}

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

function findNextVarFunction(text: string, start: number): number {
  const regex = /\bvar\s*\(/gu
  regex.lastIndex = start
  const match = regex.exec(text)
  return match?.index ?? -1
}

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
