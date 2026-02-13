import type { ColorMatch, ColorDetector } from '../core/types'
import { findColorFunctions } from './color-functions'
import { findHexRGBA } from './hex'
import { findHwb } from './hwb'
import { findNamedColors } from './named-colors'

/**
 * Regex for Stylus variable definitions:
 *   my-color = #ff0000
 *   $my-color = #ff0000
 */
const STYLUS_VAR_DEF_REGEX = /^\s*\$?([-\w]+)\s*=\s*(.*)$/gm

/**
 * Resolve variable values to colors using all base strategies.
 */
async function resolveVarValue(value: string): Promise<string | null> {
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
 * Detect Stylus variable colors.
 * Resolves variables from the current document only.
 *
 * Phase 1: Find all var = value definitions and resolve their values.
 * Phase 2: Find all var usages and map them to resolved colors.
 */
export async function findStylusVars(text: string): Promise<ColorMatch[]> {
  // Phase 1: Find variable definitions
  const varDefs = new Map<string, string>() // name -> raw value
  const varColors = new Map<string, string>() // name -> resolved color

  for (const m of text.matchAll(STYLUS_VAR_DEF_REGEX)) {
    const name = m[1]
    const value = m[2].trim()
    varDefs.set(name, value)
  }

  // Resolve variable values to colors
  await Promise.all(
    [...varDefs.entries()].map(async ([name, value]) => {
      const color = await resolveVarValue(value)
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
    const name = m[1]
    const start = m.index ?? 0
    const end = start + m[0].length

    const color = varColors.get(name)
    if (!color) continue

    matches.push({ start, end, color })
  }

  return matches
}

function buildStylusVarUsageRegex(varNames: string[]): RegExp | null {
  if (varNames.length === 0) return null
  const names = varNames
    .sort((a, b) => b.length - a.length)
    .map(name => name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
    .join('|')
  // Stylus: $?varName but not $?varName = (definition)
  return new RegExp(`\\$?(${names})(?!-|\\s*=)`, 'g')
}
