import type { ColorMatch, ColorDetector } from '../types'
import { findColorFunctions } from './color-functions'
import { findHexRGBA } from './hex'
import { findHwb } from './hwb'
import { findNamedColors } from './named-colors'

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
  const varDefs = new Map<string, string>() // name (without @) -> raw value
  const varColors = new Map<string, string>() // name (without @) -> resolved color

  for (const m of text.matchAll(LESS_VAR_DEF_REGEX)) {
    const name = m.groups?.name
    const value = m.groups?.value?.trim()
    if (!name || !value) {
      continue
    }

    varDefs.set(name, value)
  }

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
