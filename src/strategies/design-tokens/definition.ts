import type { ColorDefinitionTarget } from '../../types'
import { resolveDtcgColor } from './color'
import { resolveExternalDesignToken } from './external-loader'
import {
  createDesignTokenSource,
  getDesignTokenCurlyReferencePath,
  resolveLocalDesignToken,
} from './resolver'
import type { ResolvedDesignToken } from './resolver'
import type { DesignTokenEntry, ParsedDesignTokenDocument } from './types'

export interface ResolveDesignTokenDefinitionOptions {
  readonly filePath?: string
  readonly resolveDesignTokensAcrossFiles?: boolean
  readonly workspaceIsTrusted?: boolean
}

/** Resolve the alias expression at an offset to its final color token. */
export function resolveDesignTokenDefinition(
  document: ParsedDesignTokenDocument,
  offset: number,
  options: ResolveDesignTokenDefinitionOptions = {},
): ColorDefinitionTarget | Promise<ColorDefinitionTarget | null> | null {
  const token = document.tokens.find(
    candidate =>
      candidate.range.start <= offset && offset < candidate.range.end,
  )
  if (!token || !isDesignTokenAlias(token)) {
    return null
  }
  if (!options.filePath) {
    return null
  }

  const source = createDesignTokenSource(document, options.filePath)
  if (options.resolveDesignTokensAcrossFiles && options.workspaceIsTrusted) {
    return resolveExternalDesignToken(token, source, new Set(), 0).then(
      resolved => toDefinitionTarget(token, resolved),
    )
  }

  return toDefinitionTarget(
    token,
    resolveLocalDesignToken(token, source, new Set(), 0),
  )
}

function isDesignTokenAlias(token: DesignTokenEntry): boolean {
  return Boolean(
    token.reference || getDesignTokenCurlyReferencePath(token.value),
  )
}

function toDefinitionTarget(
  origin: DesignTokenEntry,
  resolved: ResolvedDesignToken | null,
): ColorDefinitionTarget | null {
  if (
    resolved?.type !== 'color' ||
    !resolveDtcgColor(resolved.value) ||
    resolved.kind !== 'token' ||
    !resolved.token.definitionRange
  ) {
    return null
  }

  return {
    originRange: origin.range,
    targetFilePath: resolved.source.filePath,
    targetRange: resolved.token.definitionRange,
    targetSelectionRange: resolved.token.definitionRange,
  }
}
