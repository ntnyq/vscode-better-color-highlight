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
import type { CssVarDeclaration } from './parser'
import { collectCssVarDeclarations } from './parser'

const CSS_VAR_SOURCE_EXTENSIONS = new Set(['.css', '.scss', '.less'])
const GLOB_META_REGEX = /[*?[\]{}]/u
const MAX_CSS_VAR_SOURCE_FILES = 64
const MAX_CSS_VAR_SOURCE_FILE_SIZE = 512 * 1024
const MAX_CSS_VAR_SOURCE_CACHE_SIZE = 256

interface CssVarSourceCacheEntry {
  readonly mtimeMs: number
  readonly size: number
  readonly text: string
}

export interface LoadCssVarSourceDeclarationsOptions {
  readonly filePath: string
  readonly paths: readonly string[]
  readonly trustedSelectors: readonly string[]
  readonly debug?: (message: string) => void
}

const cssVarSourceTextCache = new Map<string, CssVarSourceCacheEntry>()

/**
 * Load CSS custom property declarations from configured source paths.
 *
 * @param options - Source paths, current file path, and trusted selectors
 * @returns Parsed external custom property declarations
 */
export async function loadCssVarSourceDeclarations(
  options: LoadCssVarSourceDeclarationsOptions,
): Promise<CssVarDeclaration[]> {
  const declarations: CssVarDeclaration[] = []
  const filePaths = await collectCssVarSourceFilePaths(options)
  let sourceOrderOffset = 0

  for (const filePath of filePaths) {
    const text = await readCachedCssVarSourceFile(filePath, options.debug)
    if (text === null) continue

    const fileDeclarations = collectCssVarDeclarations(text, {
      filePath,
      sourceOrderOffset,
      trustedSelectors: options.trustedSelectors,
    })
    declarations.push(...fileDeclarations)
    sourceOrderOffset += fileDeclarations.length
  }

  return declarations
}

/**
 * Expand configured CSS variable source paths to concrete file paths.
 *
 * @param options - Source loading options
 * @returns Deduplicated CSS-like source file paths
 */
async function collectCssVarSourceFilePaths(
  options: LoadCssVarSourceDeclarationsOptions,
): Promise<string[]> {
  const filePaths: string[] = []
  const seen = new Set<string>()

  for (const sourcePath of options.paths) {
    if (filePaths.length >= MAX_CSS_VAR_SOURCE_FILES) break

    const candidates = await expandCssVarSourcePath(
      options.filePath,
      sourcePath,
      options.debug,
    )

    for (const candidate of candidates) {
      if (filePaths.length >= MAX_CSS_VAR_SOURCE_FILES) {
        debugLog(options.debug, 'Skipped CSS variable source files after limit')
        break
      }
      if (!isCssLikeSourcePath(candidate) || seen.has(candidate)) {
        continue
      }

      seen.add(candidate)
      filePaths.push(candidate)
    }
  }

  return filePaths
}

/**
 * Resolve a configured CSS variable source path against the current file.
 *
 * @param filePath - Current document file path or URI
 * @param sourcePath - Configured source path
 * @returns Absolute source path or URI
 */
function resolveCssVarSourcePath(filePath: string, sourcePath: string): string {
  return isAbsoluteWorkspacePath(sourcePath)
    ? sourcePath
    : resolveWorkspacePath(filePath, sourcePath)
}

/**
 * Expand one configured source path, directory, or glob.
 *
 * @param baseFilePath - Current document file path or URI
 * @param sourcePath - Configured source path
 * @param debug - Optional debug logger
 * @returns Candidate source file paths
 */
async function expandCssVarSourcePath(
  baseFilePath: string,
  sourcePath: string,
  debug?: (message: string) => void,
): Promise<string[]> {
  if (isGlobPath(sourcePath)) {
    const normalizedSourcePath = normalizeCssVarSourceGlobPath(sourcePath)

    try {
      return await findWorkspaceFiles(
        resolveCssVarSourceGlob(baseFilePath, normalizedSourcePath),
        MAX_CSS_VAR_SOURCE_FILES,
      )
    } catch {
      return skipPath(sourcePath, debug)
    }
  }

  const filePath = resolveCssVarSourcePath(baseFilePath, sourcePath)

  if (await workspacePathIsDirectory(filePath)) {
    return collectDirectoryCssVarSourceFilePaths(filePath, debug)
  }

  return [filePath]
}

/**
 * Resolve a configured glob relative to the current file.
 *
 * @param baseFilePath - Current document file path or URI
 * @param sourcePath - Configured glob path
 * @returns VS Code findFiles pattern
 */
function resolveCssVarSourceGlob(
  baseFilePath: string,
  sourcePath: string,
): WorkspaceFindFilesPattern {
  if (!isAbsoluteWorkspacePath(sourcePath)) {
    return {
      basePath: dirnameWorkspacePath(baseFilePath),
      pattern: sourcePath,
    }
  }

  return splitAbsoluteCssVarSourceGlob(sourcePath)
}

/**
 * Split an absolute glob into a static base path and relative pattern.
 *
 * @param sourcePath - Absolute glob path
 * @returns VS Code relative pattern components
 */
function splitAbsoluteCssVarSourceGlob(
  sourcePath: string,
): WorkspaceFindFilesPattern {
  const normalizedSourcePath = normalizeCssVarSourceGlobPath(sourcePath)
  const segments = normalizedSourcePath.split('/')
  const globIndex = segments.findIndex(segment => isGlobPath(segment))

  if (globIndex <= 0) {
    return {
      basePath: dirnameWorkspacePath(normalizedSourcePath),
      pattern: segments.at(-1) ?? normalizedSourcePath,
    }
  }

  return {
    basePath: segments.slice(0, globIndex).join('/') || '/',
    pattern: segments.slice(globIndex).join('/'),
  }
}

/**
 * Collect CSS-like source files from a configured directory.
 *
 * @param dirPath - Directory path or URI
 * @param debug - Optional debug logger
 * @returns Matching CSS, SCSS, and Less files
 */
async function collectDirectoryCssVarSourceFilePaths(
  dirPath: string,
  debug?: (message: string) => void,
): Promise<string[]> {
  try {
    return await findWorkspaceFiles(
      {
        basePath: dirPath,
        pattern: '**/*.{css,scss,less}',
      },
      MAX_CSS_VAR_SOURCE_FILES,
    )
  } catch {
    return skipPath(dirPath, debug)
  }
}

/**
 * Read and cache a CSS variable source file.
 *
 * @param filePath - Source file path or URI
 * @param debug - Optional debug logger
 * @returns File text, or null when skipped/unreadable
 */
async function readCachedCssVarSourceFile(
  filePath: string,
  debug?: (message: string) => void,
): Promise<string | null> {
  try {
    const stats = await statWorkspaceFile(filePath)
    if (stats.size > MAX_CSS_VAR_SOURCE_FILE_SIZE) {
      debugLog(debug, `Skipped large CSS variable source file: ${filePath}`)
      return null
    }

    const cached = cssVarSourceTextCache.get(filePath)
    if (
      cached &&
      cached.mtimeMs === stats.mtimeMs &&
      cached.size === stats.size
    ) {
      return cached.text
    }

    const text = await readWorkspaceFile(filePath)
    cssVarSourceTextCache.set(filePath, {
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      text,
    })
    pruneCssVarSourceTextCache()

    return text
  } catch {
    debugLog(debug, `Skipped unreadable CSS variable source file: ${filePath}`)
    return null
  }
}

/**
 * Keep the CSS variable source text cache under its size limit.
 */
function pruneCssVarSourceTextCache(): void {
  if (cssVarSourceTextCache.size <= MAX_CSS_VAR_SOURCE_CACHE_SIZE) {
    return
  }

  const oldestKey = cssVarSourceTextCache.keys().next().value
  if (oldestKey) {
    cssVarSourceTextCache.delete(oldestKey)
  }
}

/**
 * Check whether a path has a supported stylesheet extension.
 *
 * @param filePath - Candidate file path or URI
 * @returns Whether the path points to a CSS-like source file
 */
function isCssLikeSourcePath(filePath: string): boolean {
  return CSS_VAR_SOURCE_EXTENSIONS.has(
    extnameWorkspacePath(filePath).toLowerCase(),
  )
}

/**
 * Check whether a path contains glob metacharacters.
 *
 * @param filePath - Candidate path
 * @returns Whether the path should be treated as a glob
 */
function isGlobPath(filePath: string): boolean {
  return GLOB_META_REGEX.test(filePath)
}

/**
 * Normalize a configured glob path to slash separators.
 *
 * @param filePath - Raw configured path
 * @returns Glob path with forward slashes
 */
function normalizeCssVarSourceGlobPath(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}

/**
 * Report and skip a source path.
 *
 * @param filePath - Skipped path
 * @param debug - Optional debug logger
 * @returns Empty candidate list
 */
function skipPath(
  filePath: string,
  debug?: (message: string) => void,
): string[] {
  debugLog(debug, `Skipped CSS variable source path: ${filePath}`)
  return []
}

/**
 * Emit a best-effort debug message.
 *
 * @param debug - Optional debug logger
 * @param message - Message to log
 */
function debugLog(
  debug: ((message: string) => void) | undefined,
  message: string,
) {
  debug?.(message)
}
