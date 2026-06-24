import type { WorkspaceFileStat, WorkspacePathParts } from '../types'

/**
 * Check whether a path string is a VS Code URI string.
 *
 * @param value - The path or URI string to inspect
 * @returns Whether the value starts with a URI scheme
 */
function isUriString(value: string): boolean {
  return !/^[a-z]:[/\\]/iu.test(value) && /^[a-z][\d+.a-z-]*:/iu.test(value)
}

/**
 * Encode a URI path without treating `#` or `?` as URI syntax.
 *
 * @param path - Decoded path component
 * @returns Encoded path component
 */
function encodeUriPath(path: string): string {
  if (path === '/') {
    return '/'
  }

  const prefix = path.startsWith('/') ? '/' : ''
  const suffix = path.endsWith('/') ? '/' : ''
  const body = path
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')

  return `${prefix}${body}${body ? suffix : ''}`
}

/**
 * Parse a path or URI string into prefix and path parts.
 *
 * @param value - The path or URI string to parse
 * @returns Parsed workspace path parts
 */
function parseWorkspacePath(value: string): WorkspacePathParts {
  if (!isUriString(value)) {
    return {
      prefix: '',
      path: normalizeWorkspacePath(value),
      isUri: false,
    }
  }

  const url = new URL(value)

  return {
    prefix: value.slice(0, value.indexOf(url.pathname)),
    path: decodeURIComponent(url.pathname),
    isUri: true,
  }
}

/**
 * Format parsed workspace path parts.
 *
 * @param parts - Parsed workspace path parts
 * @param path - Replacement path component
 * @returns Formatted path or URI string
 */
function formatWorkspacePath(parts: WorkspacePathParts, path: string): string {
  return parts.isUri ? `${parts.prefix}${encodeUriPath(path)}` : path
}

/**
 * Normalize slash-separated path segments.
 *
 * @param path - Path to normalize
 * @returns Normalized path
 */
function normalizeWorkspacePath(path: string): string {
  const normalizedPath = path.replaceAll('\\', '/')
  const isAbsolute = normalizedPath.startsWith('/')
  const segments: string[] = []

  for (const segment of normalizedPath.split('/')) {
    if (!segment || segment === '.') {
      continue
    }
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  return `${isAbsolute ? '/' : ''}${segments.join('/')}`
}

/**
 * Convert a path or URI string to a VS Code Uri.
 *
 * @param value - The path or URI string to convert
 * @returns VS Code Uri for the value
 */
async function toUri(value: string) {
  const { Uri } = await import('vscode')

  return isUriString(value) ? Uri.parse(value) : Uri.file(value)
}

/**
 * Get a workspace path basename.
 *
 * @param value - The path or URI string to inspect
 * @returns The last path segment
 */
export function basenameWorkspacePath(value: string): string {
  const { path } = parseWorkspacePath(value)
  const segments = path.replace(/\/+$/u, '').split('/')

  return segments.at(-1) ?? ''
}

/**
 * Get a workspace path dirname.
 *
 * @param value - The path or URI string to inspect
 * @returns The parent path in the same string shape
 */
export function dirnameWorkspacePath(value: string): string {
  const parts = parseWorkspacePath(value)
  const normalized = parts.path.replace(/\/+$/u, '')
  const slashIndex = normalized.lastIndexOf('/')
  const parentPath = slashIndex <= 0 ? '/' : normalized.slice(0, slashIndex)

  return formatWorkspacePath(parts, parentPath)
}

/**
 * Get a workspace path extension.
 *
 * @param value - The path or URI string to inspect
 * @returns The extension including the leading dot, or an empty string
 */
export function extnameWorkspacePath(value: string): string {
  const baseName = basenameWorkspacePath(value)
  const dotIndex = baseName.lastIndexOf('.')

  return dotIndex > 0 ? baseName.slice(dotIndex) : ''
}

/**
 * Check whether a path or URI is absolute.
 *
 * @param value - The path or URI string to inspect
 * @returns Whether the value is absolute
 */
export function isAbsoluteWorkspacePath(value: string): boolean {
  return (
    isUriString(value) || /^[/\\]/u.test(value) || /^[a-z]:[/\\]/iu.test(value)
  )
}

/**
 * Join path segments using slash-separated workspace path semantics.
 *
 * @param base - The base path or URI string
 * @param segments - Path segments to append
 * @returns Joined path in the same string shape as the base
 */
export function joinWorkspacePath(base: string, ...segments: string[]): string {
  const parts = parseWorkspacePath(base)
  const path = normalizeWorkspacePath([parts.path, ...segments].join('/'))

  return formatWorkspacePath(parts, path)
}

/**
 * Resolve a path relative to a base file path.
 *
 * @param baseFilePath - The file path containing the relative value
 * @param value - Absolute or relative path value
 * @returns Resolved path in the same string shape as the base file path
 */
export function resolveWorkspacePath(
  baseFilePath: string,
  value: string,
): string {
  return isAbsoluteWorkspacePath(value)
    ? value
    : joinWorkspacePath(dirnameWorkspacePath(baseFilePath), value)
}

/**
 * Check whether a workspace file exists.
 *
 * @param filePath - The path or URI string to check
 * @returns Whether the file exists
 */
export async function workspacePathExists(filePath: string): Promise<boolean> {
  const { workspace } = await import('vscode')

  try {
    await workspace.fs.stat(await toUri(filePath))
    return true
  } catch {
    return false
  }
}

/**
 * Read a workspace file as UTF-8 text.
 *
 * @param filePath - The path or URI string to read
 * @returns UTF-8 file text
 */
export async function readWorkspaceFile(filePath: string): Promise<string> {
  const { workspace } = await import('vscode')
  const bytes = await workspace.fs.readFile(await toUri(filePath))

  return new TextDecoder().decode(bytes)
}

/**
 * Check whether a workspace path points to a directory.
 *
 * @param filePath - The path or URI string to check
 * @returns Whether the path exists and is a directory
 */
export async function workspacePathIsDirectory(
  filePath: string,
): Promise<boolean> {
  const { FileType, workspace } = await import('vscode')

  try {
    const stat = await workspace.fs.stat(await toUri(filePath))
    return stat.type === FileType.Directory
  } catch {
    return false
  }
}

/**
 * Read a workspace directory and return child paths in the same path shape.
 *
 * @param dirPath - The path or URI string to read
 * @returns Child paths joined to the directory path
 */
export async function readWorkspaceDirectory(
  dirPath: string,
): Promise<string[]> {
  const { workspace } = await import('vscode')
  const entries = await workspace.fs.readDirectory(await toUri(dirPath))

  return entries.map(([name]) => joinWorkspacePath(dirPath, name))
}

/**
 * Find workspace files matching a glob pattern.
 *
 * @param pattern - Workspace glob pattern
 * @param maxResults - Optional maximum number of results
 * @returns Matching file paths
 */
export async function findWorkspaceFiles(
  pattern: string,
  maxResults?: number,
): Promise<string[]> {
  const { workspace } = await import('vscode')
  const uris = await workspace.findFiles(pattern, undefined, maxResults)

  return uris.map(uri => (uri.scheme === 'file' ? uri.fsPath : uri.toString()))
}

/**
 * Stat a workspace file.
 *
 * @param filePath - The path or URI string to stat
 * @returns File metadata for cache invalidation
 */
export async function statWorkspaceFile(
  filePath: string,
): Promise<WorkspaceFileStat> {
  const { workspace } = await import('vscode')
  const stat = await workspace.fs.stat(await toUri(filePath))

  return {
    mtimeMs: stat.mtime,
    size: stat.size,
  }
}
