import {
  dirnameWorkspacePath,
  extnameWorkspacePath,
  findWorkspaceFiles,
  isAbsoluteWorkspacePath,
  readWorkspaceDirectory,
  readWorkspaceFile,
  resolveWorkspacePath,
  statWorkspaceFile,
  workspacePathIsDirectory,
} from '../utils/workspace-file-system'
import type { WorkspaceFindFilesPattern } from '../utils/workspace-file-system'
import type { CssVarDeclaration } from './css-var-parser'
import { collectCssVarDeclarations } from './css-var-parser'

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

function resolveCssVarSourcePath(filePath: string, sourcePath: string): string {
  return isAbsoluteWorkspacePath(sourcePath)
    ? sourcePath
    : resolveWorkspacePath(filePath, sourcePath)
}

async function expandCssVarSourcePath(
  baseFilePath: string,
  sourcePath: string,
  debug?: (message: string) => void,
): Promise<string[]> {
  if (isGlobPath(sourcePath)) {
    try {
      return await findWorkspaceFiles(
        resolveCssVarSourceGlob(baseFilePath, sourcePath),
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

function splitAbsoluteCssVarSourceGlob(
  sourcePath: string,
): WorkspaceFindFilesPattern {
  const segments = sourcePath.split('/')
  const globIndex = segments.findIndex(segment => isGlobPath(segment))

  if (globIndex <= 0) {
    return {
      basePath: dirnameWorkspacePath(sourcePath),
      pattern: segments.at(-1) ?? sourcePath,
    }
  }

  return {
    basePath: segments.slice(0, globIndex).join('/') || '/',
    pattern: segments.slice(globIndex).join('/'),
  }
}

async function collectDirectoryCssVarSourceFilePaths(
  dirPath: string,
  debug?: (message: string) => void,
): Promise<string[]> {
  const filePaths: string[] = []
  const pending = [dirPath]

  while (pending.length > 0 && filePaths.length < MAX_CSS_VAR_SOURCE_FILES) {
    const currentDir = pending.shift()
    if (!currentDir) break

    let children: string[]
    try {
      children = await readWorkspaceDirectory(currentDir)
    } catch {
      children = skipPath(currentDir, debug)
    }

    for (const childPath of children) {
      if (filePaths.length >= MAX_CSS_VAR_SOURCE_FILES) break

      if (await workspacePathIsDirectory(childPath)) {
        pending.push(childPath)
        continue
      }

      if (isCssLikeSourcePath(childPath)) {
        filePaths.push(childPath)
      }
    }
  }

  return filePaths
}

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

function pruneCssVarSourceTextCache(): void {
  if (cssVarSourceTextCache.size <= MAX_CSS_VAR_SOURCE_CACHE_SIZE) {
    return
  }

  const oldestKey = cssVarSourceTextCache.keys().next().value
  if (oldestKey) {
    cssVarSourceTextCache.delete(oldestKey)
  }
}

function isCssLikeSourcePath(filePath: string): boolean {
  return CSS_VAR_SOURCE_EXTENSIONS.has(
    extnameWorkspacePath(filePath).toLowerCase(),
  )
}

function isGlobPath(filePath: string): boolean {
  return GLOB_META_REGEX.test(filePath)
}

function skipPath(
  filePath: string,
  debug?: (message: string) => void,
): string[] {
  debugLog(debug, `Skipped CSS variable source path: ${filePath}`)
  return []
}

function debugLog(
  debug: ((message: string) => void) | undefined,
  message: string,
) {
  debug?.(message)
}
