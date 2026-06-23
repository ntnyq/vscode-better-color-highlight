import { STYLE_LANGUAGES } from '../constants'
import type { NestedScopedConfigs } from '../meta'
import {
  findHexRGBA,
  findHexARGB,
  findColorFunctions,
  findHwb,
  findNamedColors,
  findRgbNoFunction,
  findHslNoFunction,
  findCssVars,
  findDartColors,
  findLessVars,
  findScssVars,
  findStylusVars,
} from '../strategies'
import type { ColorDetector } from '../types'

/**
 * Check if a language ID matches a pattern list.
 * Supports '*' (match all) and '!' prefix (exclude).
 * @param languageId - The document's language ID to check
 * @param patterns - Array of language patterns (e.g. ["*", "!css"])
 * @returns Whether the language matches the pattern list
 */
function isLanguageMatch(
  languageId: string,
  patterns: readonly string[],
): boolean {
  let matched = false

  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      if (pattern.slice(1) === languageId) {
        return false
      }
    } else if (pattern === '*' || pattern === languageId) {
      matched = true
    }
  }

  return matched
}

/**
 * Get the list of color detection strategies for a given document context.
 *
 * Strategy selection is based on:
 * - Document language ID
 * - User configuration (matchWords, useARGB, etc.)
 *
 * Always-active strategies:
 * - hex detection (RGBA or ARGB mode based on config)
 * - color functions (rgb, hsl, lch, oklch, lab, oklab)
 * - hwb
 *
 * Conditional strategies:
 * - named colors: controlled by namedColorMatchMode for style languages,
 *   or when matchWords is true
 * - rgb-no-fn: when matchRgbWithNoFunction is true AND language matches
 * - hsl-no-fn: when matchHslWithNoFunction is true AND language matches
 * - css-vars: only for css/scss/less languages
 * - less-vars: only for less
 * - scss-vars: only for scss
 * - stylus-vars: only for stylus/styl
 *
 * @param languageId - The document's language ID
 * @param config - The current highlight configuration
 * @returns Array of color detection strategies to apply
 */
export function getStrategies(
  languageId: string,
  config: NestedScopedConfigs,
): ColorDetector[] {
  const strategies: ColorDetector[] = [
    // Always-active: hex (mode depends on config)
    config.useARGB ? findHexARGB : findHexRGBA,
    // Always-active: color functions + hwb
    findColorFunctions,
    findHwb,
  ]

  // Named colors: for style languages or when explicitly enabled
  const isStyleLang = STYLE_LANGUAGES.has(languageId)
  if (
    config.namedColorMatchMode !== 'never' &&
    (isStyleLang || config.matchWords)
  ) {
    strategies.push(findNamedColors)
  }

  // Bare RGB triplets
  if (
    config.matchRgbWithNoFunction &&
    isLanguageMatch(languageId, config.rgbWithNoFunctionLanguages)
  ) {
    strategies.push(findRgbNoFunction)
  }

  // Bare HSL triplets
  if (
    config.matchHslWithNoFunction &&
    isLanguageMatch(languageId, config.hslWithNoFunctionLanguages)
  ) {
    strategies.push(findHslNoFunction)
  }

  // Variable strategies: language-specific
  if (languageId === 'css' || languageId === 'scss') {
    strategies.push(findCssVars)
  }
  if (languageId === 'less') {
    strategies.push(findCssVars, findLessVars)
  }
  if (languageId === 'scss') {
    strategies.push(findScssVars)
  }
  if (languageId === 'stylus' || languageId === 'styl') {
    strategies.push(findStylusVars)
  }
  if (languageId === 'dart') {
    strategies.push(findDartColors)
  }

  return strategies
}

/**
 * Check if a language should be processed based on the languages config.
 * @param languageId - The document's language ID
 * @param languages - Array of language patterns from configuration
 * @returns Whether the language should be processed
 */
export function shouldProcessLanguage(
  languageId: string,
  languages: readonly string[],
): boolean {
  return isLanguageMatch(languageId, languages)
}
