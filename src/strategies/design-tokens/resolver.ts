import type { ColorMatch } from '../../types'
import { resolveDtcgColor } from './color'
import type { DesignTokenEntry, ParsedDesignTokenDocument } from './types'

interface ResolvedDesignToken {
  readonly type?: string
  readonly value: unknown
}

const CURLY_REFERENCE_REGEX = /^\{(?<path>[^{}]+)\}$/u
const MAX_REFERENCE_DEPTH = 32

/**
 * Resolve all locally addressable color tokens in a parsed document.
 *
 * @param document - Syntax-independent token document
 * @returns Color matches at each concrete or alias source range
 */
export function resolveLocalDesignTokenColors(
  document: ParsedDesignTokenDocument,
): ColorMatch[] {
  const tokenIndex = new Map(
    document.tokens.map(token => [createPathKey(token.path), token]),
  )
  const matches: ColorMatch[] = []

  for (const token of document.tokens) {
    const resolved = resolveToken(token, document, tokenIndex, new Set(), 0)
    if (resolved?.type !== 'color') {
      continue
    }

    const color = resolveDtcgColor(resolved.value)
    if (!color) {
      continue
    }

    matches.push({
      start: token.range.start,
      end: token.range.end,
      color,
    })
  }

  return matches
}

/** Resolve one token through local aliases and pointers. */
function resolveToken(
  token: DesignTokenEntry,
  document: ParsedDesignTokenDocument,
  tokenIndex: ReadonlyMap<string, DesignTokenEntry>,
  resolving: ReadonlySet<string>,
  depth: number,
): ResolvedDesignToken | null {
  const tokenKey = createPathKey(token.path)
  if (depth > MAX_REFERENCE_DEPTH || resolving.has(tokenKey)) {
    return null
  }

  const nextResolving = new Set(resolving)
  nextResolving.add(tokenKey)

  if (token.reference) {
    return resolvePointerReference(
      token,
      document,
      tokenIndex,
      nextResolving,
      depth,
    )
  }

  const curlyPath = getCurlyReferencePath(token.value)
  if (curlyPath) {
    const target = tokenIndex.get(createPathKey(curlyPath))
    if (!target) {
      return null
    }

    const resolved = resolveToken(
      target,
      document,
      tokenIndex,
      nextResolving,
      depth + 1,
    )
    return mergeResolvedType(token.type, resolved)
  }

  return { type: token.type, value: token.value }
}

/** Resolve a local JSON Pointer reference. */
function resolvePointerReference(
  token: DesignTokenEntry,
  document: ParsedDesignTokenDocument,
  tokenIndex: ReadonlyMap<string, DesignTokenEntry>,
  resolving: ReadonlySet<string>,
  depth: number,
): ResolvedDesignToken | null {
  const segments = parseJsonPointer(token.reference ?? '')
  if (!segments) {
    return null
  }

  if (segments.at(-1) === '$value') {
    const target = tokenIndex.get(createPathKey(segments.slice(0, -1)))
    if (target) {
      const resolved = resolveToken(
        target,
        document,
        tokenIndex,
        resolving,
        depth + 1,
      )
      return mergeResolvedType(token.type, resolved)
    }
  }

  const value = resolvePointerValue(document.root, segments)
  return value.found ? { type: token.type, value: value.value } : null
}

/** Apply an explicit alias type while rejecting known mismatches. */
function mergeResolvedType(
  explicitType: string | undefined,
  resolved: ResolvedDesignToken | null,
): ResolvedDesignToken | null {
  if (!resolved) {
    return null
  }

  if (explicitType && resolved.type && explicitType !== resolved.type) {
    return null
  }

  return {
    type: explicitType ?? resolved.type,
    value: resolved.value,
  }
}

/** Parse an exact complete-token curly reference. */
function getCurlyReferencePath(value: unknown): string[] | null {
  if (typeof value !== 'string') {
    return null
  }

  const path = value.match(CURLY_REFERENCE_REGEX)?.groups?.path
  return path ? path.split('.') : null
}

/** Parse an RFC 6901 pointer encoded as a URI fragment. */
function parseJsonPointer(reference: string): string[] | null {
  if (reference === '#') {
    return []
  }
  if (!reference.startsWith('#/')) {
    return null
  }

  try {
    return decodeURIComponent(reference.slice(2))
      .split('/')
      .map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
  } catch {
    return null
  }
}

/** Navigate a plain document value with decoded pointer segments. */
function resolvePointerValue(
  root: unknown,
  segments: readonly string[],
): { readonly found: boolean; readonly value?: unknown } {
  let current = root

  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^\d+$/u.test(segment)) {
        return { found: false }
      }
      const index = Number(segment)
      if (index >= current.length) {
        return { found: false }
      }
      current = current[index]
      continue
    }

    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { found: false }
    }
    current = current[segment]
  }

  return { found: true, value: current }
}

/** Create an unambiguous map key for a token path. */
function createPathKey(path: readonly string[]): string {
  return JSON.stringify(path)
}

/** Check for an object-like record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
