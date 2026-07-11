import { STYLE_LANGUAGES } from '../../constants'
import type { CancellationSignal, StrategyContext } from '../../types'
import {
  dirnameWorkspacePath,
  extnameWorkspacePath,
  findWorkspaceFiles,
  getWorkspacePathIdentity,
  isAbsoluteWorkspacePath,
  readWorkspaceFile,
  resolveWorkspacePath,
  statWorkspaceFile,
  workspacePathIsDirectory,
} from '../../utils/workspace-file-system'
import type { WorkspaceFindFilesPattern } from '../../utils/workspace-file-system'
import type { WorkspaceReadBudget } from '../../utils/workspace-read-budget'
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

interface ThemeLoadState {
  readonly context: StrategyContext
  fileCount: number
  readonly seen: Set<string>
  readonly sources: ParsedTailwindThemeSource[]
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
  if (context.signal?.isCancellationRequested) {
    return []
  }

  const seen = new Set<string>()
  if (supportsCurrentDocumentDirectives(context)) {
    seen.add(getWorkspacePathIdentity(context.filePath))
  }
  const state: ThemeLoadState = { context, fileCount: 0, seen, sources }

  if (
    supportsCurrentDocumentDirectives(context) &&
    (await loadCurrentTailwindDirectives(state, currentSource))
  ) {
    return []
  }

  if (await loadConfiguredTailwindPaths(state, context.filePath, paths)) {
    return []
  }

  sources.push(currentSource)

  return sources
}

async function loadCurrentTailwindDirectives(
  state: ThemeLoadState,
  source: ParsedTailwindThemeSource,
): Promise<boolean> {
  const { context } = state
  for (const directive of source.directives) {
    if (context.signal?.isCancellationRequested) {
      return true
    }
    const dependency = resolveRelativeCssSpecifier(
      context.filePath ?? '',
      directive.specifier,
    )
    if (dependency) {
      await visitTailwindThemeSource(state, dependency, 1)
    }
  }
  return context.signal?.isCancellationRequested === true
}

async function loadConfiguredTailwindPaths(
  state: ThemeLoadState,
  baseFilePath: string,
  paths: readonly string[],
): Promise<boolean> {
  const { context } = state
  for (const configuredPath of paths) {
    if (
      context.signal?.isCancellationRequested ||
      state.fileCount >= MAX_THEME_FILES
    ) {
      return context.signal?.isCancellationRequested === true
    }
    const candidates = await expandConfiguredPath(
      baseFilePath,
      configuredPath,
      MAX_THEME_FILES - state.fileCount,
      context.workspaceReadBudget,
      context.signal,
    )
    for (const candidate of candidates) {
      if (context.signal?.isCancellationRequested) {
        return true
      }
      await visitTailwindThemeSource(state, candidate, 0)
    }
  }
  return context.signal?.isCancellationRequested === true
}

async function visitTailwindThemeSource(
  state: ThemeLoadState,
  filePath: string,
  depth: number,
): Promise<void> {
  const { context } = state
  if (context.signal?.isCancellationRequested) {
    return
  }
  const identity = getWorkspacePathIdentity(filePath)
  if (
    state.fileCount >= MAX_THEME_FILES ||
    state.seen.has(identity) ||
    !isCssPath(filePath)
  ) {
    return
  }
  state.seen.add(identity)
  state.fileCount++

  const sourceText = await readCachedSource(
    filePath,
    context.workspaceReadBudget,
    context.signal,
  )
  if (context.signal?.isCancellationRequested || sourceText === null) {
    return
  }
  const source = parseTailwindThemeSource(sourceText, filePath)
  if (depth < MAX_IMPORT_DEPTH) {
    for (const directive of source.directives) {
      if (context.signal?.isCancellationRequested) {
        return
      }
      if (state.fileCount >= MAX_THEME_FILES) {
        break
      }
      const dependency = resolveRelativeCssSpecifier(
        filePath,
        directive.specifier,
      )
      if (dependency) {
        await visitTailwindThemeSource(state, dependency, depth + 1)
      }
    }
  }
  if (!context.signal?.isCancellationRequested) {
    state.sources.push(source)
  }
}

async function expandConfiguredPath(
  baseFilePath: string,
  configuredPath: string,
  limit: number,
  workspaceReadBudget?: WorkspaceReadBudget,
  signal?: CancellationSignal,
): Promise<string[]> {
  if (signal?.isCancellationRequested) {
    return []
  }
  try {
    if (isGlobPath(configuredPath)) {
      const normalized = configuredPath.replaceAll('\\', '/')
      const matches = await findWorkspaceFiles(
        resolveGlob(baseFilePath, normalized),
        limit,
      )
      return signal?.isCancellationRequested ? [] : matches
    }

    const resolved = isAbsoluteWorkspacePath(configuredPath)
      ? configuredPath
      : resolveWorkspacePath(baseFilePath, configuredPath)
    if (workspaceReadBudget && !workspaceReadBudget.tryClaim(resolved)) {
      return []
    }
    const isDirectory = await workspacePathIsDirectory(resolved)
    if (signal?.isCancellationRequested) {
      return []
    }
    if (isDirectory) {
      const matches = await findWorkspaceFiles(
        { basePath: resolved, pattern: '**/*.css' },
        limit,
      )
      return signal?.isCancellationRequested ? [] : matches
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

async function readCachedSource(
  filePath: string,
  workspaceReadBudget?: WorkspaceReadBudget,
  signal?: CancellationSignal,
): Promise<string | null> {
  if (signal?.isCancellationRequested) {
    return null
  }
  if (workspaceReadBudget && !workspaceReadBudget.tryClaim(filePath)) {
    return null
  }

  try {
    const identity = getWorkspacePathIdentity(filePath)
    const stat = await statWorkspaceFile(filePath)
    if (signal?.isCancellationRequested) {
      return null
    }
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

    if (signal?.isCancellationRequested) {
      return null
    }
    const text = await readWorkspaceFile(filePath)
    if (signal?.isCancellationRequested) {
      return null
    }
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
