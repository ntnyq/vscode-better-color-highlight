import type { ColorMatch } from '../types'
import { collectCssVarDeclarations } from './css-var-parser'
import { resolveCssVarMatches } from './css-var-resolver'

const DEFAULT_TRUSTED_CSS_VAR_SELECTORS = [':root', 'html', 'body', ':host']

/**
 * Detect CSS custom property colors.
 *
 * @param text - The document text to scan for CSS variable colors
 * @returns Array of color matches found in the text
 */
export async function findCssVars(text: string): Promise<ColorMatch[]> {
  const currentDeclarations = collectCssVarDeclarations(text, {
    includeTopLevelDeclarations: true,
    topLevelSelector: ':root',
    trustedSelectors: DEFAULT_TRUSTED_CSS_VAR_SELECTORS,
  })

  return resolveCssVarMatches(text, {
    currentDeclarations,
    externalDeclarations: [],
  })
}
