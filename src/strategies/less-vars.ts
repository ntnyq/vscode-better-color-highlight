import type {
  ColorDefinitionTarget,
  ColorMatch,
  ColorDetector,
  StrategyContext,
} from '../types'
import { findColorFunctions } from './color-functions'
import { findHexRGBA } from './hex'
import { findHwb } from './hwb'
import { findNamedColors } from './named-colors'
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
 * Less variable definitions anywhere in a stylesheet: @my-color: #ff0000;
 */
const LESS_VAR_DEF_REGEX = /@(?<name>[-\w]+)\s*:\s*(?<value>[^;]+?)\s*;/gu

/**
 * Resolve a raw Less value to a color using the base color strategies.
 *
 * @param value - The raw Less value to resolve
 * @returns The resolved rgb() color string, or null if no color is found
 */
async function resolveDirectColor(value: string): Promise<string | null> {
  const strategies: ColorDetector[] = [
    findHexRGBA,
    findColorFunctions,
    findHwb,
    findNamedColors,
  ]

  const results = await Promise.all(strategies.map(fn => fn(value)))
  const allMatches = results.flat()
  const exactMatch = allMatches.find(
    match => match.start === 0 && match.end === value.length,
  )
  return exactMatch?.color ?? null
}

/**
 * Resolve Less variable values to colors, following nested variable references.
 *
 * @param value - The raw Less variable value
 * @param varDefs - All Less variable definitions in the document
 * @param seen - Variables already visited to avoid cycles
 * @returns The resolved rgb() color string, or null if no color is found
 */
async function resolveVarValue(
  value: string,
  varDefs: Map<string, string>,
  seen = new Set<string>(),
): Promise<string | null> {
  const normalized = value.replaceAll(/!important\b/gu, '').trim()

  const directColor = await resolveDirectColor(normalized)
  if (directColor) {
    return directColor
  }

  const refName = getExactLessVarAlias(normalized)
  if (refName) {
    if (seen.has(refName)) {
      return null
    }

    const refValue = varDefs.get(refName)
    if (!refValue) {
      return null
    }

    const resolved = await resolveVarValue(
      refValue,
      varDefs,
      new Set([...seen, refName]),
    )
    if (resolved) {
      return resolved
    }
  }

  return null
}

/**
 * Parse a value that is exactly one Less variable alias.
 *
 * @param value - Normalized Less value
 * @returns Variable name without `@`, or null when value is composite
 */
function getExactLessVarAlias(value: string): string | null {
  const match = value.match(/^@(?<name>[-\w]+)$/u)
  return match?.groups?.name ?? null
}

function collectLessVarDefs(
  text: string,
  filePath: string,
): Map<string, RangedVariableDefinition> {
  const definitions = new Map<string, RangedVariableDefinition>()
  for (const match of text.matchAll(LESS_VAR_DEF_REGEX)) {
    const name = match.groups?.name
    const rawValue = match.groups?.value
    if (!name || !rawValue) {
      continue
    }

    const matchStart = match.index ?? 0
    const relativeNameStart = match[0].indexOf(`@${name}`)
    const nameStart = matchStart + relativeNameStart
    const delimiter = match[0].indexOf(':', relativeNameStart + name.length + 1)
    const { value, valueRange } = getCapturedVariableValue(
      match,
      rawValue,
      delimiter + 1,
    )
    definitions.set(name, {
      name,
      value,
      filePath,
      nameRange: { start: nameStart, end: nameStart + name.length + 1 },
      valueRange,
    })
  }
  return definitions
}

function findLessVarUsageAtOffset(
  text: string,
  offset: number,
  definitions: ReadonlyMap<string, RangedVariableDefinition>,
): VariableUsage | null {
  const regex = /@(?<name>[-\w]+)/gu
  for (const match of text.matchAll(regex)) {
    const name = match.groups?.name
    if (!name || !definitions.has(name)) {
      continue
    }
    const start = match.index ?? 0
    const end = start + match[0].length
    if (offset < start || offset >= end) {
      continue
    }
    if (/[-\w@]/u.test(text[start - 1] ?? '')) {
      continue
    }
    if (/^\s*:/u.test(text.slice(end))) {
      continue
    }
    return { name, originRange: { start, end } }
  }
  return null
}

export async function resolveLessVarDefinition(
  text: string,
  offset: number,
  context?: Pick<StrategyContext, 'filePath'>,
): Promise<ColorDefinitionTarget | null> {
  const definitions = collectLessVarDefs(text, context?.filePath ?? '')
  const usage = findLessVarUsageAtOffset(text, offset, definitions)
  if (!usage) {
    return null
  }

  const definition = await resolveRangedVariableDefinition(
    usage.name,
    definitions,
    getExactLessVarAlias,
    async value => (await resolveDirectColor(value)) !== null,
  )
  return definition ? toColorDefinitionTarget(usage, definition) : null
}

/**
 * Detect Less variable colors.
 * Phase 1: Find all @var definitions and resolve their values.
 * Phase 2: Find all @var usages and map them to resolved colors.
 *
 * @param text - The document text to scan for Less variable colors
 * @returns Array of color matches found in the text
 */
export async function findLessVars(text: string): Promise<ColorMatch[]> {
  // Phase 1: Find variable definitions
  const rangedVarDefs = collectLessVarDefs(text, '')
  const varDefs = new Map(
    [...rangedVarDefs].map(([name, definition]) => [name, definition.value]),
  )
  const varColors = new Map<string, string>() // name (without @) -> resolved color

  // Resolve variable values to colors
  await Promise.all(
    [...varDefs.entries()].map(async ([name, value]) => {
      const color = await resolveVarValue(value, varDefs)
      if (color) {
        varColors.set(name, color)
      }
    }),
  )

  if (varColors.size === 0) {
    return []
  }

  // Phase 2: Find @var usages
  const matchableNames = [...varColors.keys()]
  const usageRegex = buildLessVarUsageRegex(matchableNames)
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
 * Build a regex that matches Less @var usages for the given variable names.
 * Skips definitions (@varName:) and hyphenated names (@varName-xxx).
 *
 * @param varNames - Array of Less variable names without the @ prefix
 * @returns A RegExp matching @name usages, or null if no names provided
 */
function buildLessVarUsageRegex(varNames: string[]): RegExp | null {
  if (varNames.length === 0) {
    return null
  }
  const names = varNames
    .sort((a, b) => b.length - a.length)
    .map(name => name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join('|')
  return new RegExp(
    `(?<prefix>^|[^-\\w@])(?<full>@(?<name>${names}))(?![-\\w])(?!(?:\\s*:))`,
    'gmu',
  )
}
