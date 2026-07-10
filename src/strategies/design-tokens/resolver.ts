import type { ColorMatch } from '../../types'
import { resolveDtcgColor } from './color'
import type { DesignTokenEntry, ParsedDesignTokenDocument } from './types'

export interface DesignTokenSource {
  readonly document: ParsedDesignTokenDocument
  readonly filePath: string
  readonly tokenIndex: ReadonlyMap<string, DesignTokenEntry | null>
}

export type ResolvedDesignToken =
  | {
      readonly kind: 'token'
      readonly source: DesignTokenSource
      readonly token: DesignTokenEntry
      readonly type?: string
      readonly value: unknown
    }
  | {
      readonly kind: 'value'
      readonly type?: string
      readonly value: unknown
    }

export type DesignTokenLookup =
  | { readonly status: 'found'; readonly token: DesignTokenEntry }
  | { readonly status: 'ambiguous' }
  | { readonly status: 'missing' }

const CURLY_REFERENCE_REGEX = /^\{(?<path>[^{}]+)\}$/u
export const MAX_DESIGN_TOKEN_REFERENCE_DEPTH = 32

/** Create an indexed token source shared by color and definition resolution. */
export function createDesignTokenSource(
  document: ParsedDesignTokenDocument,
  filePath = '',
): DesignTokenSource {
  const tokenIndex = new Map<string, DesignTokenEntry | null>()
  for (const token of document.tokens) {
    const key = createPathKey(token.path)
    tokenIndex.set(key, tokenIndex.has(key) ? null : token)
  }

  return {
    document,
    filePath,
    tokenIndex,
  }
}

/** Resolve all locally addressable color tokens in a parsed document. */
export function resolveLocalDesignTokenColors(
  document: ParsedDesignTokenDocument,
): ColorMatch[] {
  const source = createDesignTokenSource(document)
  const matches: ColorMatch[] = []

  for (const token of document.tokens) {
    const resolved = resolveLocalDesignToken(token, source, new Set(), 0)
    if (resolved?.type !== 'color') {
      continue
    }

    const color = resolveDtcgColor(resolved.value)
    if (color) {
      matches.push({
        start: token.range.start,
        end: token.range.end,
        color,
      })
    }
  }

  return matches
}

/** Resolve one token through references that remain in the current source. */
export function resolveLocalDesignToken(
  token: DesignTokenEntry,
  source: DesignTokenSource,
  resolving: ReadonlySet<string>,
  depth: number,
): ResolvedDesignToken | null {
  const tokenKey = createDesignTokenCycleKey(source.filePath, token.path)
  if (depth > MAX_DESIGN_TOKEN_REFERENCE_DEPTH || resolving.has(tokenKey)) {
    return null
  }

  const nextResolving = new Set(resolving)
  nextResolving.add(tokenKey)

  if (token.reference) {
    const pointer = parseDesignTokenPointer(token.reference)
    if (!pointer) {
      return null
    }
    return mergeDesignTokenType(
      token.type,
      resolveLocalDesignTokenPointer(source, pointer, nextResolving, depth + 1),
    )
  }

  const curlyPath = getDesignTokenCurlyReferencePath(token.value)
  if (curlyPath) {
    const target = findDesignToken(source, curlyPath)
    return target.status === 'found'
      ? mergeDesignTokenType(
          token.type,
          resolveLocalDesignToken(
            target.token,
            source,
            nextResolving,
            depth + 1,
          ),
        )
      : null
  }

  return {
    kind: 'token',
    source,
    token,
    type: token.type,
    value: token.value,
  }
}

/** Resolve one local pointer to either a token or a plain document value. */
export function resolveLocalDesignTokenPointer(
  source: DesignTokenSource,
  pointer: readonly string[],
  resolving: ReadonlySet<string>,
  depth: number,
): ResolvedDesignToken | null {
  const tokenPath = getDesignTokenPointerPath(pointer)
  if (tokenPath) {
    const target = findDesignToken(source, tokenPath)
    if (target.status === 'ambiguous') {
      return null
    }
    if (target.status === 'found') {
      return resolveLocalDesignToken(target.token, source, resolving, depth)
    }
  }

  const value = resolveDesignTokenPointerValue(source.document.root, pointer)
  return value.found ? { kind: 'value', value: value.value } : null
}

/** Find a token using the source's shared semantic path index. */
export function findDesignToken(
  source: DesignTokenSource,
  path: readonly string[],
): DesignTokenLookup {
  const key = createPathKey(path)
  if (!source.tokenIndex.has(key)) {
    return { status: 'missing' }
  }

  const token = source.tokenIndex.get(key)
  return token ? { status: 'found', token } : { status: 'ambiguous' }
}

/** Parse an exact complete-token curly reference. */
export function getDesignTokenCurlyReferencePath(
  value: unknown,
): string[] | null {
  if (typeof value !== 'string') {
    return null
  }
  const path = value.match(CURLY_REFERENCE_REGEX)?.groups?.path
  return path ? path.split('.') : null
}

/** Parse an RFC 6901 pointer encoded as a URI fragment. */
export function parseDesignTokenPointer(reference: string): string[] | null {
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

/** Return the semantic token path addressed by a `$value` or `$ref` pointer. */
export function getDesignTokenPointerPath(
  pointer: readonly string[],
): readonly string[] | null {
  if (pointer.at(-1) !== '$value' && pointer.at(-1) !== '$ref') {
    return null
  }
  const path = pointer.slice(0, -1)
  return path.at(-1) === '$root' ? path.slice(0, -1) : path
}

/** Navigate a plain document value with decoded pointer segments. */
export function resolveDesignTokenPointerValue(
  root: unknown,
  segments: readonly string[],
): { readonly found: boolean; readonly value?: unknown } {
  let current = root
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^\d+$/u.test(segment) || Number(segment) >= current.length) {
        return { found: false }
      }
      current = current[Number(segment)]
      continue
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { found: false }
    }
    current = current[segment]
  }
  return { found: true, value: current }
}

/** Apply an explicit alias type while rejecting known mismatches. */
export function mergeDesignTokenType(
  explicitType: string | undefined,
  resolved: ResolvedDesignToken | null,
): ResolvedDesignToken | null {
  if (!resolved) {
    return null
  }
  if (explicitType && resolved.type && explicitType !== resolved.type) {
    return null
  }
  return { ...resolved, type: explicitType ?? resolved.type }
}

/** Create a cycle key that remains unique across source files. */
export function createDesignTokenCycleKey(
  filePath: string,
  path: readonly string[],
): string {
  return `${filePath}\0${createPathKey(path)}`
}

function createPathKey(path: readonly string[]): string {
  return JSON.stringify(path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
