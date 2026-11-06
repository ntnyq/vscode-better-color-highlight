import { waitFor } from '@ntnyq/utils'
import type {
  ColorDefinitionTarget,
  ColorSourceRange,
} from '../../definition/types'
import type { ColorMatch, StrategyContext } from '../../detection'
import { resolveShorthandColor } from '../color-functions'
import {
  formatCssColor,
  parseCssColorExpression,
  scanCssColorFunctions,
} from '../css-color/parser'
import { resolveDirectColor } from '../shared/direct-color'
import { walkCssCode } from './parser'
import type { CssSourceContext, CssVarDeclaration } from './parser'

export interface ResolveCssVarMatchOptions {
  readonly currentDeclarations: readonly CssVarDeclaration[]
  readonly externalDeclarations: readonly CssVarDeclaration[]
  readonly strategyContext?: StrategyContext
}

interface CssVarDeclarationGroup {
  readonly byContext: Map<string, CssVarDeclaration>
  hasUntrusted: boolean
}

interface IndexedCssVarOptions extends ResolveCssVarMatchOptions {
  readonly currentByName: ReadonlyMap<string, CssVarDeclarationGroup>
  readonly externalByName: ReadonlyMap<string, CssVarDeclarationGroup>
}

/**
 * Build per-run name indexes; unrelated declarations are never rescanned while
 * resolving aliases or usages. No index survives changes to a source document.
 */
function indexCssVarOptions(
  options: ResolveCssVarMatchOptions,
): IndexedCssVarOptions {
  return {
    ...options,
    currentByName: indexCssVarDeclarations(options.currentDeclarations),
    externalByName: indexCssVarDeclarations(options.externalDeclarations),
  }
}

/**
 * Index the cascade winner in each name/context group. Repeated names in many
 * rules remain constant-time lookups, and external trust covers every candidate.
 */
function indexCssVarDeclarations(declarations: readonly CssVarDeclaration[]) {
  const byName = new Map<string, CssVarDeclarationGroup>()
  for (const declaration of declarations) {
    const name = declaration.name
    let group = byName.get(name)
    if (!group) {
      group = { byContext: new Map(), hasUntrusted: false }
      byName.set(name, group)
    }
    group.hasUntrusted ||= !declaration.isTrusted
    const key = getCssVarContextKey(declaration)
    const current = group.byContext.get(key)
    if (
      !current ||
      (declaration.isImportant === current.isImportant
        ? declaration.sourceOrder > current.sourceOrder
        : declaration.isImportant)
    ) {
      group.byContext.set(key, declaration)
    }
  }
  return byName
}

export interface CssVarUsage {
  readonly name: string
  readonly fallback?: string
  readonly nameRange: ColorSourceRange
  readonly originRange: ColorSourceRange
  readonly selector: string
  readonly normalizedSelector: string
  readonly selectorContext: readonly string[]
  readonly atRuleContext: readonly string[]
}

export type CssVarCandidateResolution =
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
  | {
      readonly status: 'non-color'
    }

const MAX_RESOLUTION_DEPTH = 16

export type CssVarSourceContext = Pick<
  CssSourceContext,
  'atRuleContext' | 'normalizedSelector' | 'selectorContext'
>

/**
 * Resolve CSS custom property usages in document text to highlight colors.
 *
 * @param text - Document text to scan
 * @param input - Current-file and external declaration sets
 * @returns Color matches for resolvable `var(...)` usages
 */
export async function resolveCssVarMatches(
  text: string,
  input: ResolveCssVarMatchOptions,
): Promise<ColorMatch[]> {
  if (input.strategyContext?.signal?.isCancellationRequested) {
    return []
  }
  const options = indexCssVarOptions(input)
  const matches: ColorMatch[] = []

  const usages = findCssVarUsages(text)
  let usageIndex = 0
  let workCount = 0
  const candidates = scanCssColorFunctions(text).sort(
    (a, b) => a.start - b.start,
  )
  for (const candidate of candidates) {
    if (++workCount % 256 === 0) {
      await waitFor(0)
    }
    if (options.strategyContext?.signal?.isCancellationRequested) {
      return []
    }
    while (usages[usageIndex]?.originRange.start < candidate.start) {
      usageIndex++
    }
    const usage = usages[usageIndex]
    if (!usage || usage.originRange.end > candidate.end) {
      continue
    }
    const expanded = expandCssColorVariables(
      candidate.source,
      usage,
      options,
      new Set(),
      0,
      { remaining: 1024 },
    )
    const parsed =
      expanded.status === 'resolved'
        ? parseCssColorExpression(expanded.value)
        : null
    if (parsed) {
      matches.push({
        start: candidate.start,
        end: candidate.end,
        color: formatCssColor(parsed),
      })
    }
  }
  let scannedOffset = 0
  let declarationStart = -1
  for (const usage of getOutermostCssVarUsages(usages)) {
    if (++workCount % 256 === 0) {
      await waitFor(0)
    }
    if (options.strategyContext?.signal?.isCancellationRequested) {
      return []
    }
    for (; scannedOffset < usage.originRange.start; scannedOffset++) {
      if (
        text[scannedOffset] === ';' ||
        text[scannedOffset] === '{' ||
        text[scannedOffset] === '}'
      ) {
        declarationStart = scannedOffset
      }
    }
    if (isSkippedCssCustomPropertyValueUsage(text, usage, declarationStart)) {
      continue
    }

    const result = await resolveCssVarUsage(
      usage,
      usage,
      options,
      new Set(),
      0,
      true,
    )
    if (result.status !== 'resolved') {
      continue
    }

    matches.push({
      start: usage.originRange.start,
      end: usage.originRange.end,
      color: result.color,
    })
  }

  return options.strategyContext?.signal?.isCancellationRequested ? [] : matches
}

/**
 * Resolve the CSS variable usage at an offset to its color-valued declaration.
 *
 * @param text - Document text containing the usage
 * @param offset - Offset within the `var(...)` call
 * @param input - Current-file and external declaration sets
 * @returns Definition target, or null when resolution is unsafe or non-color
 */
export async function resolveCssVarDefinition(
  text: string,
  offset: number,
  input: ResolveCssVarMatchOptions,
): Promise<ColorDefinitionTarget | null> {
  if (input.strategyContext?.signal?.isCancellationRequested) {
    return null
  }
  const options = indexCssVarOptions(input)
  const usage = findInnermostCssVarUsage(findCssVarUsages(text), offset)
  if (!usage) {
    return null
  }

  const candidate = selectIndexedCssVarDeclaration(usage.name, options, usage)
  if (candidate.status !== 'found' || !candidate.declaration.filePath) {
    return null
  }

  const resolution = await resolveCssVarUsage(
    { name: usage.name },
    usage,
    options,
    new Set(),
    0,
    false,
  )
  if (
    resolution.status !== 'resolved' ||
    options.strategyContext?.signal?.isCancellationRequested
  ) {
    return null
  }

  return {
    originRange: usage.originRange,
    targetFilePath: candidate.declaration.filePath,
    targetRange: {
      start: candidate.declaration.nameRange.start,
      end: candidate.declaration.valueRange.end,
    },
    targetSelectionRange: candidate.declaration.nameRange,
  }
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
  usage: Pick<CssVarUsage, 'name' | 'fallback'>,
  context: CssVarSourceContext | undefined,
  options: IndexedCssVarOptions,
  seen: ReadonlySet<string>,
  depth: number,
  canUseInvalidFallback: boolean,
): Promise<CssVarResolution> {
  if (depth > MAX_RESOLUTION_DEPTH) {
    return canUseInvalidFallback
      ? resolveInvalidFallback(usage, context, options, seen, depth)
      : { status: 'invalid' }
  }

  if (seen.has(usage.name)) {
    return canUseInvalidFallback
      ? resolveInvalidFallback(usage, context, options, seen, depth)
      : { status: 'invalid' }
  }

  const candidate = selectIndexedCssVarDeclaration(usage.name, options, context)
  if (candidate.status === 'missing') {
    return resolveFallback(usage, context, options, seen, depth)
  }

  if (candidate.status === 'ambiguous') {
    return { status: 'ambiguous' }
  }

  const nextSeen = new Set(seen)
  nextSeen.add(usage.name)

  const result = await resolveCssVarValue(
    candidate.declaration.value,
    candidate.declaration.name,
    candidate.declaration,
    options,
    nextSeen,
    depth + 1,
  )

  if (result.status === 'missing') {
    return resolveFallback(usage, context, options, seen, depth)
  }

  if (result.status !== 'invalid') {
    return result
  }

  if (!canUseInvalidFallback) {
    return { status: 'invalid' }
  }

  return resolveInvalidFallback(usage, context, options, seen, depth)
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
  usage: Pick<CssVarUsage, 'fallback'>,
  context: CssVarSourceContext | undefined,
  options: IndexedCssVarOptions,
  seen: ReadonlySet<string>,
  depth: number,
): Promise<CssVarResolution> {
  if (usage.fallback === undefined) {
    return { status: 'missing' }
  }

  return await resolveCssVarValue(
    usage.fallback,
    undefined,
    context,
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
  usage: Pick<CssVarUsage, 'fallback'>,
  context: CssVarSourceContext | undefined,
  options: IndexedCssVarOptions,
  seen: ReadonlySet<string>,
  depth: number,
): Promise<CssVarResolution> {
  if (usage.fallback === undefined) {
    return { status: 'invalid' }
  }

  return await resolveCssVarValue(
    usage.fallback,
    undefined,
    context,
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
  context: CssVarSourceContext | undefined,
  options: IndexedCssVarOptions,
  seen: ReadonlySet<string>,
  depth: number,
): Promise<CssVarResolution> {
  if (depth > MAX_RESOLUTION_DEPTH) {
    return { status: 'invalid' }
  }

  const normalized = value.trim()
  if (/^initial$/iu.test(normalized)) {
    return { status: 'missing' }
  }
  const varUsages = getOutermostCssVarUsages(findCssVarUsages(normalized))

  if (varUsages.length > 0) {
    const usage = getExactCssVarAlias(normalized, varUsages)
    if (!usage) {
      const expanded = expandCssColorVariables(
        normalized,
        context,
        options,
        seen,
        depth,
        { remaining: 1024 },
      )
      const parsed =
        expanded.status === 'resolved'
          ? parseCssColorExpression(expanded.value)
          : null
      return parsed
        ? { status: 'resolved', color: formatCssColor(parsed) }
        : {
            status:
              expanded.status === 'resolved' ? 'non-color' : expanded.status,
          }
    }

    return await resolveCssVarUsage(
      usage,
      context,
      options,
      seen,
      depth + 1,
      false,
    )
  }

  const directColor = await resolveDirectColor(
    normalized,
    options.strategyContext,
  )
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

  return { status: 'non-color' }
}

type ExpandedCssValue =
  | { readonly status: 'resolved'; readonly value: string }
  | { readonly status: 'invalid' | 'ambiguous' | 'missing' }

/**
 * Substitute deterministic custom-property tokens before parsing an expression.
 * Keep original color spaces and numeric precision, with independent recursion,
 * expansion-count, and output-length bounds for branching variable graphs.
 */
function expandCssColorVariables(
  value: string,
  context: CssVarSourceContext | undefined,
  options: IndexedCssVarOptions,
  seen: ReadonlySet<string>,
  depth: number,
  budget: { remaining: number },
): ExpandedCssValue {
  if (
    depth > MAX_RESOLUTION_DEPTH ||
    value.length > 65_536 ||
    --budget.remaining < 0
  ) {
    return { status: 'invalid' }
  }
  if (/^initial$/iu.test(value.trim())) {
    return { status: 'missing' }
  }
  let result = value
  const usages = getOutermostCssVarUsages(findCssVarUsages(value))
  for (const usage of usages.toReversed()) {
    if (seen.has(usage.name)) {
      return { status: 'invalid' }
    }
    const candidate = selectIndexedCssVarDeclaration(
      usage.name,
      options,
      context,
    )
    if (candidate.status === 'ambiguous') {
      return { status: 'ambiguous' }
    }
    const nextSeen = new Set(seen)
    nextSeen.add(usage.name)
    const source =
      candidate.status === 'found'
        ? candidate.declaration.value
        : usage.fallback
    if (source === undefined) {
      return { status: 'missing' }
    }
    let expanded = expandCssColorVariables(
      source,
      candidate.status === 'found' ? candidate.declaration : context,
      options,
      nextSeen,
      depth + 1,
      budget,
    )
    if (
      expanded.status === 'missing' &&
      candidate.status === 'found' &&
      usage.fallback !== undefined
    ) {
      expanded = expandCssColorVariables(
        usage.fallback,
        context,
        options,
        seen,
        depth + 1,
        budget,
      )
    }
    if (expanded.status !== 'resolved') {
      return expanded
    }
    result =
      result.slice(0, usage.originRange.start) +
      expanded.value +
      result.slice(usage.originRange.end)
    if (result.length > 65_536) {
      return { status: 'invalid' }
    }
  }
  return { status: 'resolved', value: result }
}

/**
 * Select the declaration that should satisfy a variable name.
 *
 * @param name - CSS custom property name, including `--`
 * @param options - Resolver declaration sets
 * @returns Candidate selection state
 */
export function selectCssVarDeclaration(
  name: string,
  options: ResolveCssVarMatchOptions,
  context?: CssVarSourceContext,
): CssVarCandidateResolution {
  return selectIndexedCssVarDeclaration(
    name,
    indexCssVarOptions(options),
    context,
  )
}

/**
 * Apply cascade and ambiguity rules to candidates for just one variable name.
 */
function selectIndexedCssVarDeclaration(
  name: string,
  options: IndexedCssVarOptions,
  context?: CssVarSourceContext,
): CssVarCandidateResolution {
  const current = options.currentByName.get(name)
  const external = options.externalByName.get(name)
  const group = current ?? external
  if (!group) {
    return { status: 'missing' }
  }
  if (!current && group.hasUntrusted) {
    return { status: 'ambiguous' }
  }
  const exact = context
    ? group.byContext.get(getCssVarContextKey(context))
    : undefined
  if (exact) {
    return { status: 'found', declaration: exact }
  }
  if (group.byContext.size > 1) {
    return { status: 'ambiguous' }
  }
  const declaration = group.byContext.values().next().value
  return declaration ? { status: 'found', declaration } : { status: 'missing' }
}

/**
 * Identify selector and at-rule context consistently for declarations and usages.
 */
function getCssVarContextKey(context: CssVarSourceContext): string {
  return JSON.stringify([context.selectorContext, context.atRuleContext])
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
  usages: readonly CssVarUsage[],
): CssVarUsage | null {
  if (usages.length !== 1) {
    return null
  }

  const usage = usages[0]
  if (value.slice(0, usage.originRange.start).trim()) {
    return null
  }
  if (value.slice(usage.originRange.end).trim()) {
    return null
  }

  return usage
}

/**
 * Check whether a `var(...)` usage inside a custom property should be skipped.
 *
 * @param text - Full document text
 * @param usage - Parsed variable usage
 * @returns Whether the usage belongs to an unsupported `--name:` value
 */
function isSkippedCssCustomPropertyValueUsage(
  text: string,
  usage: CssVarUsage,
  declarationStart: number,
): boolean {
  const declarationPrefix = text.slice(
    declarationStart + 1,
    usage.originRange.start,
  )
  const colonIndex = declarationPrefix.indexOf(':')
  if (colonIndex === -1) {
    return false
  }

  const propertyName = declarationPrefix.slice(0, colonIndex).trim()
  if (!/^--[-\w]+$/u.test(propertyName)) {
    return false
  }
  if (usage.fallback !== undefined) {
    return true
  }

  const declarationEnd = findCssDeclarationEnd(text, usage.originRange.end)
  const valueBeforeUsage = declarationPrefix.slice(colonIndex + 1)
  const valueAfterUsage = text.slice(usage.originRange.end, declarationEnd)

  return hasCssValueText(valueBeforeUsage) || hasCssValueText(valueAfterUsage)
}

/**
 * Check whether a CSS value segment contains non-ignored text.
 *
 * @param value - CSS value segment before or after a `var(...)` usage
 * @returns Whether meaningful value text remains
 */
function hasCssValueText(value: string): boolean {
  return Boolean(
    value
      .replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
      .replaceAll(/!important\b/gu, ' ')
      .trim(),
  )
}

/**
 * Find the end offset of the declaration containing a value usage.
 *
 * @param text - Full document text
 * @param start - Offset after the usage
 * @returns Offset of the declaration end marker, or text length
 */
function findCssDeclarationEnd(text: string, start: number): number {
  let quote: '"' | "'" | undefined
  let isEscaped = false
  let parenDepth = 0

  for (let index = start; index < text.length; index++) {
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
      continue
    }
    if (char === ')' && parenDepth > 0) {
      parenDepth--
      continue
    }

    if (parenDepth === 0 && (char === ';' || char === '}')) {
      return index
    }
  }

  return text.length
}

/**
 * Find parseable CSS `var(...)` usages in text.
 *
 * @param text - Text to scan
 * @returns Parsed variable usages with source offsets
 */
export function findCssVarUsages(text: string): CssVarUsage[] {
  const usages: CssVarUsage[] = []
  const pendingCalls = new Map<
    number,
    {
      readonly context: CssSourceContext
      readonly varStart: number
    }
  >()
  const parenStack: (
    | {
        readonly context: CssSourceContext
        readonly openParen: number
        readonly varStart: number
      }
    | undefined
  )[] = []

  walkCssCode(text, (index, context) => {
    const char = text[index]
    if (
      text.startsWith('var', index) &&
      !/[-\w]/u.test(text[index - 1] ?? '')
    ) {
      let openParen = index + 'var'.length
      while (/\s/u.test(text[openParen] ?? '')) {
        openParen++
      }
      if (text[openParen] === '(') {
        pendingCalls.set(openParen, { context, varStart: index })
      }
    }

    if (char === '(') {
      const pending = pendingCalls.get(index)
      pendingCalls.delete(index)
      parenStack.push(
        pending && {
          ...pending,
          openParen: index,
        },
      )
      return
    }
    if (char !== ')') {
      return
    }

    const call = parenStack.pop()
    if (!call) {
      return
    }
    const content = text.slice(call.openParen + 1, index)
    const parsed = parseCssVarContent(content)
    if (!parsed) {
      return
    }
    const nameStart = call.openParen + 1 + parsed.nameOffset
    usages.push({
      name: parsed.name,
      fallback: parsed.fallback,
      nameRange: {
        start: nameStart,
        end: nameStart + parsed.name.length,
      },
      originRange: {
        start: call.varStart,
        end: index + 1,
      },
      ...call.context,
    })
  })

  return usages.sort(
    (left, right) => left.originRange.start - right.originRange.start,
  )
}

/**
 * Select outermost var() usages from references ordered by source position.
 */
function getOutermostCssVarUsages(
  usages: readonly CssVarUsage[],
): CssVarUsage[] {
  const outermost: CssVarUsage[] = []
  let outerEnd = -1

  for (const usage of usages) {
    if (usage.originRange.start < outerEnd) {
      continue
    }
    outermost.push(usage)
    outerEnd = usage.originRange.end
  }

  return outermost
}

/**
 * Find the innermost var() usage containing an offset in source order.
 */
function findInnermostCssVarUsage(
  usages: readonly CssVarUsage[],
  offset: number,
): CssVarUsage | undefined {
  let innermost: CssVarUsage | undefined

  for (const usage of usages) {
    if (usage.originRange.start > offset) {
      break
    }
    if (offset < usage.originRange.end) {
      innermost = usage
    }
  }

  return innermost
}

/**
 * Parse the content inside a CSS `var(...)` call.
 *
 * @param content - Text between the `var(` and matching `)`
 * @returns Parsed variable name and fallback, or null for invalid content
 */
function parseCssVarContent(content: string): {
  readonly name: string
  readonly fallback?: string
  readonly nameOffset: number
} | null {
  const commaIndex = findTopLevelComma(content)
  const nameSegment = commaIndex === -1 ? content : content.slice(0, commaIndex)
  const rawName = nameSegment.trim()

  if (!/^--[-\w]+$/u.test(rawName)) {
    return null
  }

  const fallback =
    commaIndex === -1 ? undefined : content.slice(commaIndex + 1).trim()

  return {
    name: rawName,
    fallback,
    nameOffset: nameSegment.indexOf(rawName),
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

    if (char === ',' && parenDepth === 0) {
      return index
    }
  }

  return -1
}
