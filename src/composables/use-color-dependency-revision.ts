import { onDeactivate, ref, watch } from 'reactive-vscode'
import type { Ref } from 'reactive-vscode'
import type { Disposable, FileSystemWatcher, Uri } from 'vscode'
import { RelativePattern, Uri as VscodeUri, workspace } from 'vscode'
import { config } from '../config'
import {
  basenameWorkspacePath,
  dirnameWorkspacePath,
  isAbsoluteWorkspacePath,
} from '../utils/workspace-file-system'

const COLOR_DEPENDENCY_GLOB =
  '**/*.{css,json,jsonc,less,sass,scss,tokens,yaml,yml}'
const STYLESHEET_PATH_REGEX = /\.(?:css|less|sass|scss)$/iu
const TOKEN_PATH_REGEX = /\.(?:json|jsonc|tokens|yaml|yml)$/iu
const DEPENDENCY_FILE_PATH_REGEX =
  /\.(?:css|json|jsonc|less|sass|scss|tokens|yaml|yml)$/iu
const GLOB_CHARACTER_REGEX = /[*?[\]{}]/u
const DEPENDENCY_INVALIDATION_DEBOUNCE_MS = 100

function isCrossFileResolutionEnabled(): boolean {
  return (
    config.resolveCssVariablesAcrossFiles ||
    config.resolveScssVariablesAcrossFiles ||
    config.resolveDesignTokensAcrossFiles ||
    config.tailwindStylesheetPaths.length > 0
  )
}

function isRelevantDependency(path: string): boolean {
  return (
    ((config.resolveCssVariablesAcrossFiles ||
      config.resolveScssVariablesAcrossFiles) &&
      STYLESHEET_PATH_REGEX.test(path)) ||
    (config.tailwindStylesheetPaths.length > 0 && /\.css$/iu.test(path)) ||
    (config.resolveDesignTokensAcrossFiles && TOKEN_PATH_REGEX.test(path))
  )
}

/**
 * Track source changes that can invalidate cross-file color resolution.
 *
 * @returns Reactive dependency revision shared by highlighting and hover caches.
 */
export function useColorDependencyRevision(): Readonly<Ref<number>> {
  const revision = ref(0)
  let watchers: FileSystemWatcher[] = []
  let watcherDisposables: Disposable[] = []
  let invalidationTimer: ReturnType<typeof setTimeout> | undefined

  const invalidate = (uri: Pick<Uri, 'path'>) => {
    if (!isRelevantDependency(uri.path)) {
      return
    }

    if (invalidationTimer) {
      clearTimeout(invalidationTimer)
    }
    invalidationTimer = setTimeout(() => {
      invalidationTimer = undefined
      revision.value++
    }, DEPENDENCY_INVALIDATION_DEBOUNCE_MS)
  }

  const disposeWatcher = () => {
    if (invalidationTimer) {
      clearTimeout(invalidationTimer)
      invalidationTimer = undefined
    }
    for (const disposable of watcherDisposables) {
      disposable.dispose()
    }
    watcherDisposables = []
    for (const watcher of watchers) {
      watcher.dispose()
    }
    watchers = []
  }

  const stopConfigWatch = watch(
    isCrossFileResolutionEnabled,
    enabled => {
      disposeWatcher()
      if (!enabled) {
        return
      }

      const patterns = [COLOR_DEPENDENCY_GLOB, ...getExternalWatcherPatterns()]
      watchers = patterns.map(pattern =>
        workspace.createFileSystemWatcher(pattern),
      )
      watcherDisposables = watchers.flatMap(watcher => [
        watcher.onDidChange(invalidate),
        watcher.onDidCreate(invalidate),
        watcher.onDidDelete(invalidate),
      ])
    },
    { immediate: true },
  )
  const documentChangeDisposable = workspace.onDidChangeTextDocument(event => {
    if (isCrossFileResolutionEnabled()) {
      invalidate(event.document.uri)
    }
  })

  onDeactivate(() => {
    stopConfigWatch()
    documentChangeDisposable.dispose()
    disposeWatcher()
  })

  return revision
}

/** Build bounded watcher patterns for configured absolute dependency roots. */
function getExternalWatcherPatterns(): RelativePattern[] {
  const sources: { path: string; isDirectory: boolean }[] = []
  if (config.resolveScssVariablesAcrossFiles) {
    sources.push(
      ...config.scssLoadPaths.map(path => ({ path, isDirectory: true })),
    )
  }
  if (config.resolveCssVariablesAcrossFiles) {
    sources.push(
      ...config.cssVariablePaths.map(path => ({ path, isDirectory: false })),
    )
  }
  sources.push(
    ...config.tailwindStylesheetPaths.map(path => ({
      path,
      isDirectory: false,
    })),
  )

  const seen = new Set<string>()
  const patterns: RelativePattern[] = []
  for (const source of sources) {
    const pattern = getExternalWatcherPattern(source.path, source.isDirectory)
    if (!pattern) {
      continue
    }

    const key = `${pattern.basePath}\0${pattern.pattern}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    patterns.push(
      new RelativePattern(toWatcherUri(pattern.basePath), pattern.pattern),
    )
  }

  return patterns
}

/** Resolve one configured absolute source to a bounded relative pattern. */
function getExternalWatcherPattern(
  value: string,
  isDirectory: boolean,
): { readonly basePath: string; readonly pattern: string } | null {
  if (!isAbsoluteWorkspacePath(value)) {
    return null
  }

  const normalized = value.replaceAll('\\', '/')
  const globIndex = normalized.search(GLOB_CHARACTER_REGEX)
  if (globIndex >= 0) {
    const slashIndex = normalized.lastIndexOf('/', globIndex)
    if (slashIndex === -1) {
      return null
    }

    return {
      basePath: normalized.slice(0, slashIndex) || '/',
      pattern: normalized.slice(slashIndex + 1),
    }
  }

  if (!isDirectory && DEPENDENCY_FILE_PATH_REGEX.test(normalized)) {
    return {
      basePath: dirnameWorkspacePath(normalized),
      pattern: basenameWorkspacePath(normalized),
    }
  }

  return { basePath: normalized, pattern: COLOR_DEPENDENCY_GLOB }
}

/** Convert a local path or URI string to a VS Code URI. */
function toWatcherUri(value: string): Uri {
  const isUri =
    !/^[a-z]:[/\\]/iu.test(value) && /^[a-z][\d+.a-z-]*:/iu.test(value)
  return isUri ? VscodeUri.parse(value) : VscodeUri.file(value)
}
