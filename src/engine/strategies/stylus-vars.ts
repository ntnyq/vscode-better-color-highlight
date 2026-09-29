import type { ColorDefinitionTarget } from '../definition/types'
import type { ColorMatch, StrategyContext } from '../detection'
import { resolveShorthandColor } from './color-functions'
import { resolveDirectColor } from './shared/direct-color'
import { resolveVariableColors } from './shared/variable-colors'
import {
  getCapturedVariableValue,
  resolveRangedVariableDefinition,
  toColorDefinitionTarget,
} from './shared/variable-definition'
import type {
  RangedVariableDefinition,
  VariableUsage,
} from './shared/variable-definition'

/**
 * Regex for Stylus variable definitions.
 *
 * Notes:
 * - `=` assignments may be bare or `$`-prefixed
 * - `:` assignments must be `$`-prefixed to avoid confusing property
 *   declarations like `color: red` with variable definitions
 *
 * Examples:
 *   my-color = #ff0000
 *   $my-color = #ff0000
 *   $my-color: #ff0000
 */
const STYLUS_VAR_DEF_REGEX =
  /(?:^|[;\n]\s*)(?:\$(?<colonName>[-\w]+)\s*:\s*(?<colonValue>[^\n;]+)|\$?(?<equalsName>[-\w]+)\s*=\s*(?<equalsValue>[^\n;]+))/gmu

/**
 * Parsed Stylus variable definition.
 */
interface StylusVarDefinition {
  /**
   * Variable name without a leading `$`.
   */
  name: string

  /**
   * Raw variable value.
   */
  value: string
}

/**
 * Collect Stylus variable definitions with name and value source ranges.
 */
function collectRangedStylusVarDefs(
  text: string,
  filePath: string,
): Map<string, RangedVariableDefinition> {
  const definitions = new Map<string, RangedVariableDefinition>()
  for (const match of text.matchAll(STYLUS_VAR_DEF_REGEX)) {
    const definition = getStylusVarDefinition(match)
    const rawValue = match.groups?.colonValue ?? match.groups?.equalsValue
    if (!definition || !rawValue) {
      continue
    }

    const matchStart = match.index ?? 0
    let token = definition.name
    if (match.groups?.colonName || match[0].includes(`$${definition.name}`)) {
      token = `$${definition.name}`
    }
    const relativeNameStart = match[0].indexOf(token)
    const nameStart = matchStart + relativeNameStart
    const delimiter = match[0].search(/[:=]/u)
    const { value, valueRange } = getCapturedVariableValue(
      match,
      rawValue,
      delimiter + 1,
    )
    definitions.set(definition.name, {
      name: definition.name,
      value,
      filePath,
      nameRange: { start: nameStart, end: nameStart + token.length },
      valueRange,
    })
  }
  return definitions
}

/**
 * Extract a Stylus variable definition from a regex match.
 *
 * @param match - The regex match from `STYLUS_VAR_DEF_REGEX`
 * @returns The parsed variable definition, or null if the match is incomplete
 */
function getStylusVarDefinition(
  match: RegExpMatchArray,
): StylusVarDefinition | null {
  const name = match.groups?.colonName ?? match.groups?.equalsName
  const rawValue = match.groups?.colonValue ?? match.groups?.equalsValue
  const value = rawValue?.trim()

  return name && value ? { name, value } : null
}

/**
 * Parse a value that is exactly one Stylus variable alias.
 *
 * @param value - Normalized Stylus value
 * @returns Variable name without `$`, or null when value is composite
 */
function getExactStylusVarAlias(value: string): string | null {
  const match = value.match(/^\$?(?<name>[-\w]+)$/u)
  return match?.groups?.name ?? null
}

/**
 * Find a known Stylus variable reference at an offset, excluding declarations.
 */
function findStylusVarUsageAtOffset(
  text: string,
  offset: number,
  definitions: ReadonlyMap<string, RangedVariableDefinition>,
): VariableUsage | null {
  const names = [...definitions.keys()]
    .sort((a, b) => b.length - a.length)
    .map(name => name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join('|')
  if (!names) {
    return null
  }

  const regex = new RegExp(`(?<![-\\w$])\\$?(?<name>${names})(?![-\\w])`, 'gu')
  for (const match of text.matchAll(regex)) {
    const name = match.groups?.name
    if (!name) {
      continue
    }
    const start = match.index ?? 0
    const end = start + match[0].length
    if (offset < start || offset >= end) {
      continue
    }
    if (/^\s*[:=]/u.test(text.slice(end))) {
      continue
    }
    return { name, originRange: { start, end } }
  }
  return null
}

/**
 * Resolve a Stylus reference through local aliases to a color definition.
 */
export async function resolveStylusVarDefinition(
  text: string,
  offset: number,
  context?: Partial<StrategyContext>,
): Promise<ColorDefinitionTarget | null> {
  const definitions = collectRangedStylusVarDefs(text, context?.filePath ?? '')
  const usage = findStylusVarUsageAtOffset(text, offset, definitions)
  if (!usage) {
    return null
  }

  const definition = await resolveRangedVariableDefinition(
    usage.name,
    definitions,
    getExactStylusVarAlias,
    async (value, name) =>
      (await resolveDirectColor(value, context)) !== null ||
      resolveShorthandColor(value, name) !== null,
  )
  return definition ? toColorDefinitionTarget(usage, definition) : null
}

/**
 * Detect Stylus variable colors.
 * Resolves variables from the current document only.
 *
 * Phase 1: Find all var = value definitions and resolve their values.
 * Phase 2: Find all var usages and map them to resolved colors.
 *
 * @param text - The document text to scan for Stylus variable colors
 * @param context - Optional strategy context with parser settings
 * @returns Array of color matches found in the text
 */
export async function findStylusVars(
  text: string,
  context?: StrategyContext,
): Promise<ColorMatch[]> {
  // Phase 1: Find variable definitions
  const rangedVarDefs = collectRangedStylusVarDefs(text, '')
  const varDefs = new Map(
    [...rangedVarDefs].map(([name, definition]) => [name, definition.value]),
  )
  const varColors = await resolveVariableColors(
    varDefs,
    getExactStylusVarAlias,
    async (value, name) =>
      (await resolveDirectColor(value, context)) ??
      resolveShorthandColor(value, name),
    context?.signal,
  )

  if (varColors.size === 0) {
    return []
  }

  // Phase 2: Find variable usages
  const matchableNames = [...varColors.keys()]
  const usageRegex = buildStylusVarUsageRegex(matchableNames)
  if (!usageRegex) {
    return []
  }

  const matches: ColorMatch[] = []

  for (const m of text.matchAll(usageRegex)) {
    const prefix = m.groups?.prefix ?? ''
    const fullMatch = m.groups?.full
    const name = m.groups?.name
    if (!fullMatch || !name) {
      continue
    }

    const start = (m.index ?? 0) + prefix.length
    const end = start + fullMatch.length

    const color = varColors.get(name)
    if (!color) {
      continue
    }

    matches.push({ start, end, color })
  }

  return matches
}

/**
 * Build a regex that matches Stylus variable usages for the given names.
 * Skips definitions (varName =) and hyphenated names (varName-xxx).
 *
 * @param varNames - Array of Stylus variable names
 * @returns A RegExp matching var name usages, or null if no names provided
 */
function buildStylusVarUsageRegex(varNames: string[]): RegExp | null {
  if (varNames.length === 0) {
    return null
  }
  const names = varNames
    .sort((a, b) => b.length - a.length)
    .map(name => name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join('|')
  return new RegExp(
    `(?<prefix>^|[^-\\w$])(?<full>\\$?(?<name>${names}))(?![-\\w])(?!(?:\\s*[:=]))`,
    'gmu',
  )
}
