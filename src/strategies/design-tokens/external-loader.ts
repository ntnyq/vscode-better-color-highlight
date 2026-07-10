import type { ColorMatch } from '../../types'
import {
  extnameWorkspacePath,
  isAbsoluteWorkspacePath,
  readWorkspaceFile,
  resolveWorkspacePath,
  statWorkspaceFile,
} from '../../utils/workspace-file-system'
import { resolveDtcgColor } from './color'
import { parseJsonDesignTokenDocument } from './json-document'
import type { DesignTokenEntry, ParsedDesignTokenDocument } from './types'
import { parseYamlDesignTokenDocument } from './yaml-document'

interface CachedDocument {
  readonly document: ParsedDesignTokenDocument
  readonly signature: string
}

interface DocumentSource {
  readonly document: ParsedDesignTokenDocument
  readonly filePath: string
}

interface ResolvedDesignToken {
  readonly type?: string
  readonly value: unknown
}

interface ReferenceTarget {
  readonly filePath: string
  readonly pointer: readonly string[]
}

export interface ResolveDesignTokenColorsOptions {
  readonly filePath: string
}

const CURLY_REFERENCE_REGEX = /^\{(?<path>[^{}]+)\}$/u
const MAX_EXTERNAL_FILE_SIZE = 512 * 1024
const MAX_REFERENCE_DEPTH = 32
const documentCache = new Map<string, CachedDocument>()

/**
 * Resolve local and trusted relative external references for one document.
 *
 * @param document - Parsed root token document
 * @param options - Root source location
 * @returns Matches whose ranges belong to the root document
 */
export async function resolveDesignTokenColors(
  document: ParsedDesignTokenDocument,
  options: ResolveDesignTokenColorsOptions,
): Promise<ColorMatch[]> {
  const source = { document, filePath: options.filePath }
  const matches = await Promise.all(
    document.tokens.map(async token => {
      const resolved = await resolveToken(token, source, new Set(), 0)
      if (resolved?.type !== 'color') {
        return null
      }

      const color = resolveDtcgColor(resolved.value)
      return color
        ? { start: token.range.start, end: token.range.end, color }
        : null
    }),
  )

  return matches.filter(match => match !== null)
}

/** Resolve one token through local and external references. */
async function resolveToken(
  token: DesignTokenEntry,
  source: DocumentSource,
  resolving: ReadonlySet<string>,
  depth: number,
): Promise<ResolvedDesignToken | null> {
  const tokenKey = `${source.filePath}\0${JSON.stringify(token.path)}`
  if (depth > MAX_REFERENCE_DEPTH || resolving.has(tokenKey)) {
    return null
  }

  const nextResolving = new Set(resolving)
  nextResolving.add(tokenKey)

  if (token.reference) {
    const target = getReferenceTarget(source, token.reference)
    if (!target) {
      return null
    }
    const targetSource =
      target.filePath === source.filePath
        ? source
        : await loadDocument(target.filePath)
    if (!targetSource) {
      return null
    }

    const resolved = await resolvePointer(
      targetSource,
      target.pointer,
      nextResolving,
      depth + 1,
    )
    return mergeResolvedType(token.type, resolved)
  }

  const curlyPath = getCurlyReferencePath(token.value)
  if (curlyPath) {
    const target = findToken(source.document, curlyPath)
    if (!target) {
      return null
    }
    const resolved = await resolveToken(
      target,
      source,
      nextResolving,
      depth + 1,
    )
    return mergeResolvedType(token.type, resolved)
  }

  return { type: token.type, value: token.value }
}

/** Resolve a pointer within a loaded document. */
async function resolvePointer(
  source: DocumentSource,
  pointer: readonly string[],
  resolving: ReadonlySet<string>,
  depth: number,
): Promise<ResolvedDesignToken | null> {
  if (pointer.at(-1) === '$value' || pointer.at(-1) === '$ref') {
    const target = findToken(source.document, pointer.slice(0, -1))
    if (target) {
      return await resolveToken(target, source, resolving, depth)
    }
  }

  const value = resolvePointerValue(source.document.root, pointer)
  return value.found ? { value: value.value } : null
}

/** Parse and locate a local or relative external reference. */
function getReferenceTarget(
  source: DocumentSource,
  reference: string,
): ReferenceTarget | null {
  const hashIndex = reference.indexOf('#')
  if (hashIndex === -1) {
    return null
  }

  const fileReference = reference.slice(0, hashIndex)
  const pointer = parseJsonPointer(reference.slice(hashIndex))
  if (!pointer) {
    return null
  }

  if (!fileReference) {
    return { filePath: source.filePath, pointer }
  }
  if (isAbsoluteWorkspacePath(fileReference)) {
    return null
  }

  return {
    filePath: resolveWorkspacePath(source.filePath, fileReference),
    pointer,
  }
}

/** Load and cache one supported external token document. */
async function loadDocument(filePath: string): Promise<DocumentSource | null> {
  const extension = extnameWorkspacePath(filePath).toLowerCase()
  if (!['.json', '.jsonc', '.yaml', '.yml'].includes(extension)) {
    return null
  }

  try {
    const stat = await statWorkspaceFile(filePath)
    if (stat.size > MAX_EXTERNAL_FILE_SIZE) {
      return null
    }

    const signature = JSON.stringify([
      stat.documentVersion,
      stat.mtimeMs,
      stat.size,
    ])
    const cached = documentCache.get(filePath)
    if (cached?.signature === signature) {
      return { document: cached.document, filePath }
    }

    const text = await readWorkspaceFile(filePath)
    const document =
      extension === '.json' || extension === '.jsonc'
        ? parseJsonDesignTokenDocument(text)
        : parseYamlDesignTokenDocument(text)
    if (!document) {
      return null
    }

    documentCache.set(filePath, { document, signature })
    return { document, filePath }
  } catch {
    return null
  }
}

/** Apply an explicit source type while rejecting known mismatches. */
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
  return { type: explicitType ?? resolved.type, value: resolved.value }
}

/** Find a parsed token by its semantic path. */
function findToken(
  document: ParsedDesignTokenDocument,
  path: readonly string[],
): DesignTokenEntry | undefined {
  const key = JSON.stringify(path)
  return document.tokens.find(token => JSON.stringify(token.path) === key)
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

/** Check for an object-like record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
