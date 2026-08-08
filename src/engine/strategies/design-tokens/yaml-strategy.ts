import type { ColorMatch, StrategyContext } from '../../detection'
import { resolveDesignTokenColors } from './external-loader'
import { resolveLocalDesignTokenColors } from './resolver'
import { parseYamlDesignTokenDocument } from './yaml-document'

/**
 * Detect structured DTCG color tokens in YAML documents.
 *
 * YAML intentionally uses only semantic design-token detection. General
 * literal strategies are not applied, so arbitrary YAML strings are ignored.
 *
 * @param text - YAML source text
 * @param context - Optional strategy context
 * @returns Color matches for valid design tokens
 */
export function findYamlDesignTokens(
  text: string,
  context?: StrategyContext & {
    readonly resolveDesignTokensAcrossFiles?: false
  },
): ColorMatch[]
export function findYamlDesignTokens(
  text: string,
  context: StrategyContext & { readonly resolveDesignTokensAcrossFiles: true },
): ColorMatch[] | Promise<ColorMatch[]>
export function findYamlDesignTokens(
  text: string,
  context?: StrategyContext,
): ColorMatch[] | Promise<ColorMatch[]>
export function findYamlDesignTokens(
  text: string,
  context?: StrategyContext,
): ColorMatch[] | Promise<ColorMatch[]> {
  if (context?.designTokenJsonMode === 'off') {
    return []
  }

  const document = parseYamlDesignTokenDocument(text)
  if (!document) {
    return []
  }
  if (
    context?.resolveDesignTokensAcrossFiles &&
    context.workspaceIsTrusted &&
    context.filePath
  ) {
    return resolveDesignTokenColors(document, {
      filePath: context.filePath,
      signal: context.signal,
      workspaceReadBudget: context.workspaceReadBudget,
    })
  }
  return resolveLocalDesignTokenColors(document)
}
