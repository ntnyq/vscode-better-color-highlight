import { onDeactivate, ref, watch } from 'reactive-vscode'
import type { Ref } from 'reactive-vscode'
import type { Disposable, FileSystemWatcher, Uri } from 'vscode'
import { workspace } from 'vscode'
import { config } from '../config'

const STYLESHEET_GLOB = '**/*.{css,less,sass,scss}'
const STYLESHEET_PATH_REGEX = /\.(?:css|less|sass|scss)$/iu

function isCrossFileResolutionEnabled(): boolean {
  return (
    config.resolveCssVariablesAcrossFiles ||
    config.resolveScssVariablesAcrossFiles
  )
}

/**
 * Track stylesheet changes that can invalidate cross-file color resolution.
 *
 * @returns Reactive dependency revision shared by highlighting and hover caches.
 */
export function useStylesheetDependencyRevision(): Readonly<Ref<number>> {
  const revision = ref(0)
  let watcher: FileSystemWatcher | undefined
  let watcherDisposables: Disposable[] = []

  const invalidate = (uri: Pick<Uri, 'path'>) => {
    if (STYLESHEET_PATH_REGEX.test(uri.path)) {
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

      watcher = workspace.createFileSystemWatcher(STYLESHEET_GLOB)
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
