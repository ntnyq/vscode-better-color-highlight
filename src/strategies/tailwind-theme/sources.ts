import { STYLE_LANGUAGES } from '../../constants'
import type { StrategyContext } from '../../types'
import {
  dirnameWorkspacePath,
  extnameWorkspacePath,
  findWorkspaceFiles,
  isAbsoluteWorkspacePath,
  readWorkspaceFile,
  resolveWorkspacePath,
  statWorkspaceFile,
  workspacePathIsDirectory,
} from '../../utils/workspace-file-system'
import type { WorkspaceFindFilesPattern } from '../../utils/workspace-file-system'
import {
  isEmbeddedStyleFilePath,
  parseTailwindThemeSource,
  type ParsedTailwindThemeSource,
} from './parser'

const GLOB_META_REGEX = /[*?[\]{}]/u
const MAX_THEME_FILES = 32
const MAX_IMPORT_DEPTH = 5
const MAX_THEME_FILE_SIZE = 512 * 1024
const MAX_CACHE_SIZE = 256

interface SourceCacheEntry {
  readonly documentVersion?: number
  readonly mtimeMs: number
  readonly size: number
  readonly text: string
}

const sourceTextCache = new Map<string, SourceCacheEntry>()

/** Load the current document and configured, trusted Tailwind CSS sources. */
export async function loadTailwindThemeSources(
  text: string,
  context: StrategyContext,
): Promise<ParsedTailwindThemeSource[]> {
  const currentSource = parseTailwindThemeSource(text, context.filePath)
  const sources: ParsedTailwindThemeSource[] = []
  const paths = context.tailwindStylesheetPaths ?? []
  if (!context.workspaceIsTrusted || !context.filePath || paths.length === 0) {
    return [currentSource]
  }

  const seen = new Set<string>()
  if (supportsCurrentDocumentDirectives(context)) {
    seen.add(canonicalizeSourceIdentity(context.filePath))
  }
  let fileCount = 0

  const visit = async (filePath: string, depth: number): Promise<void> => {
    const identity = canonicalizeSourceIdentity(filePath)
    if (
      fileCount >= MAX_THEME_FILES ||
      seen.has(identity) ||
      !isCssPath(filePath)
    ) {
      return
    }
    seen.add(identity)
    fileCount++

    const sourceText = await readCachedSource(filePath)
    if (sourceText === null) {
      return
    }
    const source = parseTailwindThemeSource(sourceText, filePath)
    if (depth < MAX_IMPORT_DEPTH) {
      for (const directive of source.directives) {
        if (fileCount >= MAX_THEME_FILES) {
          break
        }
        const dependency = resolveRelativeCssSpecifier(
          filePath,
          directive.specifier,
        )
        if (dependency) {
          await visit(dependency, depth + 1)
        }
      }
    }
    sources.push(source)
  }

  if (supportsCurrentDocumentDirectives(context)) {
    for (const directive of currentSource.directives) {
      const dependency = resolveRelativeCssSpecifier(
        context.filePath,
        directive.specifier,
      )
      if (dependency) {
        await visit(dependency, 1)
      }
    }
  }

  for (const configuredPath of paths) {
    if (fileCount >= MAX_THEME_FILES) {
      break
    }
    const candidates = await expandConfiguredPath(
      context.filePath,
      configuredPath,
      MAX_THEME_FILES - fileCount,
    )
    for (const candidate of candidates) {
      await visit(candidate, 0)
    }
  }

  sources.push(currentSource)

  return sources
}

async function expandConfiguredPath(
  baseFilePath: string,
  configuredPath: string,
  limit: number,
): Promise<string[]> {
  try {
    if (isGlobPath(configuredPath)) {
      const normalized = configuredPath.replaceAll('\\', '/')
      return await findWorkspaceFiles(
        resolveGlob(baseFilePath, normalized),
        limit,
      )
    }

    const resolved = isAbsoluteWorkspacePath(configuredPath)
      ? configuredPath
      : resolveWorkspacePath(baseFilePath, configuredPath)
    if (await workspacePathIsDirectory(resolved)) {
      return await findWorkspaceFiles(
        { basePath: resolved, pattern: '**/*.css' },
        limit,
      )
    }
    return [resolved]
  } catch {
    return []
  }
}

function resolveGlob(
  baseFilePath: string,
  configuredPath: string,
): WorkspaceFindFilesPattern {
  if (!isAbsoluteWorkspacePath(configuredPath)) {
    return {
      basePath: dirnameWorkspacePath(baseFilePath),
      pattern: configuredPath,
    }
  }

  const segments = configuredPath.split('/')
  const globIndex = segments.findIndex(isGlobPath)
  return globIndex <= 0
    ? {
        basePath: dirnameWorkspacePath(configuredPath),
        pattern: segments.at(-1) ?? configuredPath,
      }
    : {
        basePath: segments.slice(0, globIndex).join('/') || '/',
        pattern: segments.slice(globIndex).join('/'),
      }
}

function resolveRelativeCssSpecifier(
  filePath: string,
  specifier: string,
): string | null {
  if (
    (!specifier.startsWith('./') && !specifier.startsWith('../')) ||
    extnameWorkspacePath(specifier).toLowerCase() !== '.css'
  ) {
    return null
  }
  return resolveWorkspacePath(filePath, specifier)
}

async function readCachedSource(filePath: string): Promise<string | null> {
  try {
    const identity = canonicalizeSourceIdentity(filePath)
    const stat = await statWorkspaceFile(filePath)
    if (stat.size > MAX_THEME_FILE_SIZE) {
      return null
    }
    const cached = sourceTextCache.get(identity)
    if (
      cached &&
      cached.documentVersion === stat.documentVersion &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.size === stat.size
    ) {
      return cached.text
    }

    const text = await readWorkspaceFile(filePath)
    sourceTextCache.set(identity, { ...stat, text })
    if (sourceTextCache.size > MAX_CACHE_SIZE) {
      const oldest = sourceTextCache.keys().next().value
      if (oldest) {
        sourceTextCache.delete(oldest)
      }
    }
    return text
  } catch {
    return null
  }
}

/** Normalize equivalent local file URI and fsPath spellings for deduplication. */
function canonicalizeSourceIdentity(filePath: string): string {
  if (/^file:/iu.test(filePath)) {
    try {
      const url = new URL(filePath)
      const authority = url.hostname ? `//${url.hostname}` : ''
      let path = decodeURIComponent(url.pathname)
      if (/^\/[a-z]:\//iu.test(path)) {
        path = path.slice(1)
      }
      return normalizeLocalPath(`${authority}${path}`)
    } catch {
      return filePath
    }
  }
  if (
    isAbsoluteWorkspacePath(filePath) &&
    (/^[a-z]:[/\\]/iu.test(filePath) || !/^[a-z][\d+.a-z-]*:/iu.test(filePath))
  ) {
    return normalizeLocalPath(filePath)
  }
  return filePath
}

function normalizeLocalPath(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const prefix = normalized.startsWith('/') ? '/' : ''
  const segments: string[] = []
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') {
      continue
    }
    if (segment === '..') {
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  if (/^[a-z]:$/iu.test(segments[0] ?? '')) {
    segments[0] = segments[0].toLowerCase()
  }
  return `${prefix}${segments.join('/')}`
}

function isCssPath(filePath: string): boolean {
  return extnameWorkspacePath(filePath).toLowerCase() === '.css'
}

function supportsCurrentDocumentDirectives(context: StrategyContext): boolean {
  return (
    STYLE_LANGUAGES.has(context.languageId) ||
    Boolean(context.filePath && isEmbeddedStyleFilePath(context.filePath))
  )
}

function isGlobPath(filePath: string): boolean {
  return GLOB_META_REGEX.test(filePath)
}
