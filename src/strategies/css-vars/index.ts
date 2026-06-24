import type { ColorMatch, StrategyContext } from '../../types'
import { collectCssVarDeclarations } from './parser'
import { resolveCssVarMatches } from './resolver'
import { loadCssVarSourceDeclarations } from './sources'

const DEFAULT_TRUSTED_CSS_VAR_SELECTORS = [':root', 'html', 'body', ':host']

/**
 * Detect CSS custom property colors.
 *
 * @param text - The document text to scan for CSS variable colors
 * @param context - Optional strategy context for cross-file resolution
 * @returns Array of color matches found in the text
 */
export async function findCssVars(
  text: string,
  context?: StrategyContext,
): Promise<ColorMatch[]> {
  const currentDeclarations = collectCssVarDeclarations(text, {
    includeTopLevelDeclarations: true,
    topLevelSelector: ':root',
    trustedSelectors: DEFAULT_TRUSTED_CSS_VAR_SELECTORS,
  })
  const externalDeclarations =
    context?.resolveCssVariablesAcrossFiles === true && context.filePath
      ? await loadCssVarSourceDeclarations({
          filePath: context.filePath,
          paths: context.cssVariablePaths ?? [],
          trustedSelectors:
            context.cssVariableTrustedSelectors ??
            DEFAULT_TRUSTED_CSS_VAR_SELECTORS,
        })
      : []

  return resolveCssVarMatches(text, {
    currentDeclarations,
    externalDeclarations,
  })
}
