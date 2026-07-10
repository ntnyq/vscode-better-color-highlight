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
import {
  createDesignTokenCycleKey,
  createDesignTokenSource,
  findDesignToken,
  getDesignTokenCurlyReferencePath,
  getDesignTokenPointerPath,
  MAX_DESIGN_TOKEN_REFERENCE_DEPTH,
  mergeDesignTokenType,
  parseDesignTokenPointer,
  resolveDesignTokenPointerValue,
} from './resolver'
import type { DesignTokenSource, ResolvedDesignToken } from './resolver'
import type { DesignTokenEntry, ParsedDesignTokenDocument } from './types'
import { parseYamlDesignTokenDocument } from './yaml-document'

interface CachedDocument {
  readonly source: DesignTokenSource
  readonly signature: string
}

interface ReferenceTarget {
  readonly filePath: string
  readonly pointer: readonly string[]
}

export interface ResolveDesignTokenColorsOptions {
  readonly filePath: string
}

const MAX_EXTERNAL_FILE_SIZE = 512 * 1024
const documentCache = new Map<string, CachedDocument>()

/** Resolve local and trusted relative external references for one document. */
export async function resolveDesignTokenColors(
  document: ParsedDesignTokenDocument,
  options: ResolveDesignTokenColorsOptions,
): Promise<ColorMatch[]> {
  const source = createDesignTokenSource(document, options.filePath)
  const matches = await Promise.all(
    document.tokens.map(async token => {
      const resolved = await resolveExternalDesignToken(
        token,
        source,
        new Set(),
        0,
      )
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

/** Resolve a token through local and relative external references. */
export async function resolveExternalDesignToken(
  token: DesignTokenEntry,
  source: DesignTokenSource,
  resolving: ReadonlySet<string>,
  depth: number,
): Promise<ResolvedDesignToken | null> {
  const tokenKey = createDesignTokenCycleKey(source.filePath, token.path)
  if (depth > MAX_DESIGN_TOKEN_REFERENCE_DEPTH || resolving.has(tokenKey)) {
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
        : await loadDesignTokenDocument(target.filePath)
    if (!targetSource) {
      return null
    }

    return mergeDesignTokenType(
      token.type,
      await resolveExternalPointer(
        targetSource,
        target.pointer,
        nextResolving,
        depth + 1,
      ),
    )
  }

  const curlyPath = getDesignTokenCurlyReferencePath(token.value)
  if (curlyPath) {
    const target = findDesignToken(source, curlyPath)
    return target.status === 'found'
      ? mergeDesignTokenType(
          token.type,
          await resolveExternalDesignToken(
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

/** Parse and locate a local or relative external reference. */
function getReferenceTarget(
  source: DesignTokenSource,
  reference: string,
): ReferenceTarget | null {
  const hashIndex = reference.indexOf('#')
  if (hashIndex === -1) {
    return null
  }

  const fileReference = reference.slice(0, hashIndex)
  const pointer = parseDesignTokenPointer(reference.slice(hashIndex))
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

/** Load and cache one bounded supported external token document. */
export async function loadDesignTokenDocument(
  filePath: string,
): Promise<DesignTokenSource | null> {
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
      return cached.source
    }

    const text = await readWorkspaceFile(filePath)
    const document =
      extension === '.json' || extension === '.jsonc'
        ? parseJsonDesignTokenDocument(text)
        : parseYamlDesignTokenDocument(text)
    if (!document) {
      return null
    }

    const source = createDesignTokenSource(document, filePath)
    documentCache.set(filePath, { source, signature })
    return source
  } catch {
    return null
  }
}

async function resolveExternalPointer(
  source: DesignTokenSource,
  pointer: readonly string[],
  resolving: ReadonlySet<string>,
  depth: number,
): Promise<ResolvedDesignToken | null> {
  const tokenPath = getDesignTokenPointerPath(pointer)
  if (tokenPath) {
    const target = findDesignToken(source, tokenPath)
    if (target.status === 'ambiguous') {
      return null
    }
    if (target.status === 'found') {
      return await resolveExternalDesignToken(
        target.token,
        source,
        resolving,
        depth,
      )
    }
  }

  const value = resolveDesignTokenPointerValue(source.document.root, pointer)
  return value.found ? { kind: 'value', value: value.value } : null
}
