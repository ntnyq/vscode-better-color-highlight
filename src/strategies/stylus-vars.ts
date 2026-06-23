import type { ColorMatch, ColorDetector } from '../types'
import { findColorFunctions, resolveShorthandColor } from './color-functions'
import { findHexRGBA } from './hex'
import { findHwb } from './hwb'
import { findNamedColors } from './named-colors'

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
 * Regex for Stylus variable references:
 *   my-color
 *   $my-color
 */
const STYLUS_VAR_REF_REGEX = /\$?(?<name>[-\w]+)/gu

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
 * Resolve a raw Stylus value to a color using the base color strategies.
 *
 * @param value - The raw Stylus value to resolve
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
  return allMatches.length > 0 ? allMatches[0].color : null
}

/**
 * Resolve Stylus variable values to colors, following nested variable references.
 *
 * @param value - The raw Stylus variable value
 * @param varDefs - All Stylus variable definitions in the document
 * @param currentName - Optional current variable name used as shorthand hint
 * @param seen - Variables already visited to avoid cycles
 * @returns The resolved rgb() color string, or null if no color is found
 */
async function resolveVarValue(
  value: string,
  varDefs: Map<string, string>,
  currentName?: string,
  seen = new Set<string>(),
): Promise<string | null> {
  const normalized = value.replaceAll(/!important\b/gu, '').trim()

  const directColor = await resolveDirectColor(normalized)
  if (directColor) {
    return directColor
  }

  const shorthandColor = resolveShorthandColor(normalized, currentName)
  if (shorthandColor) {
    return shorthandColor
  }

  for (const m of normalized.matchAll(STYLUS_VAR_REF_REGEX)) {
    const refName = m.groups?.name
    if (!refName) continue

    if (seen.has(refName)) {
      continue
    }

    const refValue = varDefs.get(refName)
    if (!refValue) {
      continue
    }

    const resolved = await resolveVarValue(
      refValue,
      varDefs,
      refName,
      new Set([...seen, refName]),
    )
    if (resolved) {
      return resolved
    }
  }

  return null
}

/**
 * Detect Stylus variable colors.
 * Resolves variables from the current document only.
 *
 * Phase 1: Find all var = value definitions and resolve their values.
 * Phase 2: Find all var usages and map them to resolved colors.
 *
 * @param text - The document text to scan for Stylus variable colors
 * @returns Array of color matches found in the text
 */
export async function findStylusVars(text: string): Promise<ColorMatch[]> {
  // Phase 1: Find variable definitions
  const varDefs = new Map<string, string>() // name -> raw value
  const varColors = new Map<string, string>() // name -> resolved color

  for (const m of text.matchAll(STYLUS_VAR_DEF_REGEX)) {
    const definition = getStylusVarDefinition(m)
    if (!definition) {
      continue
    }

    varDefs.set(definition.name, definition.value)
  }

  // Resolve variable values to colors
  await Promise.all(
    [...varDefs.entries()].map(async ([name, value]) => {
      const color = await resolveVarValue(value, varDefs, name)
      if (color) {
        varColors.set(name, color)
      }
    }),
  )

  if (varColors.size === 0) return []

  // Phase 2: Find variable usages
  const matchableNames = [...varColors.keys()]
  const usageRegex = buildStylusVarUsageRegex(matchableNames)
  if (!usageRegex) return []

  const matches: ColorMatch[] = []

  for (const m of text.matchAll(usageRegex)) {
    const prefix = m.groups?.prefix ?? ''
    const fullMatch = m.groups?.full
    const name = m.groups?.name
    if (!fullMatch || !name) continue

    const start = (m.index ?? 0) + prefix.length
    const end = start + fullMatch.length

    const color = varColors.get(name)
    if (!color) continue

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
  if (varNames.length === 0) return null
  const names = varNames
    .sort((a, b) => b.length - a.length)
    .map(name => name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join('|')
  return new RegExp(
    `(?<prefix>^|[^-\\w$])(?<full>\\$?(?<name>${names}))(?![-\\w])(?!(?:\\s*[:=]))`,
    'gmu',
  )
}
