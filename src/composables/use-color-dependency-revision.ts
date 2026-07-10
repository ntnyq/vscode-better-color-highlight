import { onDeactivate, ref, watch } from 'reactive-vscode'
import type { Ref } from 'reactive-vscode'
import type { Disposable, FileSystemWatcher, Uri } from 'vscode'
import { workspace } from 'vscode'
import { config } from '../config'

const COLOR_DEPENDENCY_GLOB = '**/*.{css,json,jsonc,less,sass,scss,yaml,yml}'
const STYLESHEET_PATH_REGEX = /\.(?:css|less|sass|scss)$/iu
const TOKEN_PATH_REGEX = /\.(?:json|jsonc|yaml|yml)$/iu

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
  let watcher: FileSystemWatcher | undefined
  let watcherDisposables: Disposable[] = []

  const invalidate = (uri: Pick<Uri, 'path'>) => {
    if (isRelevantDependency(uri.path)) {
      revision.value++
    }
  }

  const disposeWatcher = () => {
    for (const disposable of watcherDisposables) {
      disposable.dispose()
    }
    watcherDisposables = []
    watcher?.dispose()
    watcher = undefined
  }

  const stopConfigWatch = watch(
    isCrossFileResolutionEnabled,
    enabled => {
      disposeWatcher()
      if (!enabled) {
        return
      }

      watcher = workspace.createFileSystemWatcher(COLOR_DEPENDENCY_GLOB)
      watcherDisposables = [
        watcher.onDidChange(invalidate),
        watcher.onDidCreate(invalidate),
        watcher.onDidDelete(invalidate),
      ]
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
