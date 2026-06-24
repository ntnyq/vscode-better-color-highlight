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
  const topLevelDeclarations = collectCssVarDeclarations(`:root {${text}}`, {
    trustedSelectors: DEFAULT_TRUSTED_CSS_VAR_SELECTORS,
  })
  const blockDeclarations = collectCssVarDeclarations(text, {
    sourceOrderOffset: topLevelDeclarations.length,
    trustedSelectors: DEFAULT_TRUSTED_CSS_VAR_SELECTORS,
  })
  const currentDeclarations = [...topLevelDeclarations, ...blockDeclarations]

  return resolveCssVarMatches(text, {
    currentDeclarations,
    externalDeclarations: [],
  })
}
