import type { ColorMatch, ColorDetector } from '../core/types'
import { findColorFunctions, resolveShorthandColor } from './color-functions'
import { findHexRGBA } from './hex'
import { findHwb } from './hwb'
import { findNamedColors } from './named-colors'

/**
 * Regex for CSS custom property definitions anywhere in a stylesheet:
 *   --my-color: #ff0000;
 *   :root { --my-color: #ff0000; }
 */
const CSS_VAR_DEF_REGEX = /(?<name>--[-\w]+)\s*:\s*(?<value>[^;]+?)\s*;/gu

/**
 * Regex for CSS custom property references:
 *   var(--my-color)
 *   var(--my-color, #ff0000)
 */
const CSS_VAR_REF_REGEX =
  /var\(\s*(?<name>--[-\w]+)\s*(?:,\s*(?<fallback>[^)]*?))?\s*\)/gu

/**
 * Build a regex that matches var() usages for the given variable names.
 * Names are sorted by length descending to avoid partial matches.
 *
 * @param varNames - Array of CSS custom property names (e.g. ["--my-color"])
 * @returns A RegExp matching var(--name) usages, or null if no names provided
 */
function buildVarUsageRegex(varNames: string[]): RegExp | null {
  if (varNames.length === 0) return null
  const names = varNames
    .sort((a, b) => b.length - a.length)
    .map(name => name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join('|')
  return new RegExp(
    `(?<full>var\\(\\s*(?<name>${names})(?:\\s*,\\s*[^)]*?)?\\s*\\))`,
    'gu',
  )
}

/**
 * Resolve a raw CSS value to a color using the base color strategies.
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
 * Resolve variable values to colors, following nested var() references.
 *
 * @param value - The raw variable value string to resolve
 * @param varDefs - All CSS variable definitions in the document
 * @param seen - Variables already visited to avoid cycles
 * @returns The resolved rgb() color string, or null if no color found
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

  for (const m of normalized.matchAll(CSS_VAR_REF_REGEX)) {
    const refName = m.groups?.name
    if (!refName) continue

    const fallback = m.groups?.fallback?.trim()

    if (!seen.has(refName)) {
      const refValue = varDefs.get(refName)
      if (refValue) {
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
    }

    if (fallback) {
      const resolvedFallback = await resolveVarValue(
        fallback,
        varDefs,
        currentName,
        seen,
      )
      if (resolvedFallback) {
        return resolvedFallback
      }
    }
  }

  return null
}

/**
 * Detect CSS custom property colors.
 * Phase 1: Find all variable definitions and resolve their values.
 * Phase 2: Find all var() usages and map them to resolved colors.
 *
 * @param text - The document text to scan for CSS variable colors
 * @returns Array of color matches found in the text
 */
export async function findCssVars(text: string): Promise<ColorMatch[]> {
  // Phase 1: Find variable definitions
  const varDefs = new Map<string, string>() // name -> raw value
  const varColors = new Map<string, string>() // name -> resolved color

  for (const m of text.matchAll(CSS_VAR_DEF_REGEX)) {
    const name = m.groups?.name
    const value = m.groups?.value?.trim()
    if (!name || !value) continue

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

  // Phase 2: Find var() usages
  const matchableNames = [...varColors.keys()]
  const usageRegex = buildVarUsageRegex(matchableNames)
  if (!usageRegex) return []

  const matches: ColorMatch[] = []

  for (const m of text.matchAll(usageRegex)) {
    const fullMatch = m.groups?.full
    const varName = m.groups?.name
    if (!fullMatch || !varName) continue

    const start = m.index ?? 0
    const end = start + fullMatch.length

    const color = varColors.get(varName)
    if (!color) continue

    matches.push({ start, end, color })
  }

  return matches
}
