/* oxlint-disable unicorn/prefer-export-from -- Resolver APIs are both consumed and re-exported here. */
import type { ColorMatch, StrategyContext } from '../../types'
import { collectCssVarDeclarations } from './parser'
import {
  findCssVarUsages,
  resolveCssVarDefinition,
  resolveCssVarMatches,
  selectCssVarDeclaration,
} from './resolver'
import type {
  CssVarCandidateResolution,
  CssVarSourceContext,
  CssVarUsage,
  ResolveCssVarMatchOptions,
} from './resolver'
import { loadCssVarSourceDeclarations } from './sources'

export { findCssVarUsages, resolveCssVarDefinition, selectCssVarDeclaration }
export type {
  CssVarCandidateResolution,
  CssVarSourceContext,
  CssVarUsage,
  ResolveCssVarMatchOptions,
}

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
    context?.resolveCssVariablesAcrossFiles === true &&
    context.workspaceIsTrusted !== false &&
    context.filePath
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
