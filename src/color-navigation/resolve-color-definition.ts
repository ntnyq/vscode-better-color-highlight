import { resolveCssVarDefinition } from '../strategies/css-vars'
import { collectCssVarDeclarations } from '../strategies/css-vars/parser'
import { loadCssVarSourceDeclarations } from '../strategies/css-vars/sources'
import { resolveDesignTokenDefinition } from '../strategies/design-tokens/definition'
import { parseJsonDesignTokenDocument } from '../strategies/design-tokens/json-document'
import { parseYamlDesignTokenDocument } from '../strategies/design-tokens/yaml-document'
import { resolveLessVarDefinition } from '../strategies/less-vars'
import { resolveScssVarDefinition } from '../strategies/scss-vars'
import { resolveStylusVarDefinition } from '../strategies/stylus-vars'
import { resolveTailwindColorDefinition } from '../strategies/tailwind-theme/definition'
import type { ColorDefinitionTarget, StrategyContext } from '../types'
import { logger } from '../utils/logger'

const DEFAULT_TRUSTED_CSS_VAR_SELECTORS = [':root', 'html', 'body', ':host']

/** Resolve a color-variable reference using the current language strategy. */
export async function resolveColorDefinition(
  text: string,
  offset: number,
  context: StrategyContext,
): Promise<ColorDefinitionTarget | null> {
  try {
    if (!isStructuredTokenLanguage(context.languageId, context.filePath)) {
      const tailwindTarget = await resolveTailwindColorDefinition(
        text,
        offset,
        context,
      )
      if (tailwindTarget) {
        return tailwindTarget
      }
    }

    if (isJsonTokenDocument(context.languageId, context.filePath)) {
      return await resolveDesignTokenDocument(
        parseJsonDesignTokenDocument(text),
        offset,
        context,
      )
    }

    switch (context.languageId) {
      case 'css': {
        return await resolveCssDefinition(text, offset, context)
      }
      case 'scss': {
        return (
          (await resolveScssVarDefinition(text, offset, context)) ??
          (await resolveCssDefinition(text, offset, context))
        )
      }
      case 'less': {
        return (
          (await resolveLessVarDefinition(text, offset, context)) ??
          (await resolveCssDefinition(text, offset, context))
        )
      }
      case 'stylus': {
        return await resolveStylusVarDefinition(text, offset, context)
      }
      case 'yaml':
      case 'yml': {
        return await resolveDesignTokenDocument(
          parseYamlDesignTokenDocument(text),
          offset,
          context,
        )
      }
      default: {
        return null
      }
    }
  } catch (error) {
    logger.error(`Color definition resolution failed: ${error}`)
    return null
  }
}

function isStructuredTokenLanguage(
  languageId: string,
  filePath?: string,
): boolean {
  return (
    isJsonTokenDocument(languageId, filePath) ||
    languageId === 'yaml' ||
    languageId === 'yml'
  )
}

function isJsonTokenDocument(languageId: string, filePath?: string): boolean {
  return (
    languageId === 'json' ||
    languageId === 'jsonc' ||
    Boolean(filePath && /\.tokens(?:$|[?#])/iu.test(filePath))
  )
}

async function resolveCssDefinition(
  text: string,
  offset: number,
  context: StrategyContext,
): Promise<ColorDefinitionTarget | null> {
  const trustedSelectors =
    context.cssVariableTrustedSelectors ?? DEFAULT_TRUSTED_CSS_VAR_SELECTORS
  const currentDeclarations = collectCssVarDeclarations(text, {
    filePath: context.filePath,
    includeTopLevelDeclarations: true,
    topLevelSelector: ':root',
    trustedSelectors,
  })
  const externalDeclarations =
    context.resolveCssVariablesAcrossFiles &&
    context.workspaceIsTrusted &&
    context.filePath
      ? await loadCssVarSourceDeclarations({
          filePath: context.filePath,
          paths: context.cssVariablePaths ?? [],
          trustedSelectors,
        })
      : []

  return resolveCssVarDefinition(text, offset, {
    currentDeclarations,
    externalDeclarations,
  })
}

async function resolveDesignTokenDocument(
  document: Parameters<typeof resolveDesignTokenDefinition>[0] | null,
  offset: number,
  context: StrategyContext,
): Promise<ColorDefinitionTarget | null> {
  if (
    !document ||
    !shouldResolveStructuredDesignTokens(
      context.languageId,
      context.designTokenJsonMode,
      context.filePath,
    )
  ) {
    return null
  }

  return await resolveDesignTokenDefinition(document, offset, {
    filePath: context.filePath,
    resolveDesignTokensAcrossFiles: context.resolveDesignTokensAcrossFiles,
    signal: context.signal,
    workspaceIsTrusted: context.workspaceIsTrusted,
  })
}

/** Match structured navigation availability to each detector's mode gates. */
function shouldResolveStructuredDesignTokens(
  languageId: string,
  mode: StrategyContext['designTokenJsonMode'],
  filePath?: string,
): boolean {
  if (mode === 'off') {
    return false
  }

  return !isJsonTokenDocument(languageId, filePath) || mode !== 'strings'
}
