import type { ColorMatch, ColorDetector } from '../core/types'
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
  /(?:^|[;\n]\s*)(?:\$([-\w]+)\s*:\s*([^\n;]+)|\$?([-\w]+)\s*=\s*([^\n;]+))/gmu

/**
 * Regex for Stylus variable references:
 *   my-color
 *   $my-color
 */
const STYLUS_VAR_REF_REGEX = /\$?([-\w]+)/gu

/**
 * Resolve a raw Stylus value to a color using the base color strategies.
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
    const refName = m[1]
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
    const name = m[1] ?? m[3]
    const rawValue = m[2] ?? m[4]
    const value = rawValue?.trim()

    if (!name || !value) {
      continue
    }

    varDefs.set(name, value)
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
    const prefix = m[1] ?? ''
    const fullMatch = m[2]
    const name = m[3]
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
    `(^|[^-\\w$])(\\$?(${names}))(?![-\\w])(?!(?:\\s*[:=]))`,
    'gmu',
  )
}
