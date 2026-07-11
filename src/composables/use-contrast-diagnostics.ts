import { onDeactivate, watch } from 'reactive-vscode'
import type { Ref } from 'reactive-vscode'
import {
  CancellationTokenSource,
  CodeActionKind,
  languages,
  workspace,
} from 'vscode'
import type { TextDocument } from 'vscode'
import { config } from '../config'
import { createContrastCodeActionProvider } from '../contrast/code-actions'
import {
  contrastDiagnosticStore,
  createContrastDiagnosticEntries,
} from '../contrast/diagnostics'
import { findContrastPairs } from '../contrast/find-contrast-pairs'
import { shouldProcessLanguage } from '../core/strategy-registry'
import { shouldTrackDocument } from '../utils/editor-filter'
import { logger } from '../utils/logger'

const DIAGNOSTIC_DEBOUNCE_MS = 200

/** Maintain opt-in low-contrast diagnostics for currently open documents. */
export function useContrastDiagnostics(
  dependencyRevision: Readonly<Ref<number>>,
): void {
  const collection = languages.createDiagnosticCollection(
    'better-color-highlight',
  )
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const tokens = new Map<string, CancellationTokenSource>()
  const activeGenerations = new Map<string, number>()
  let nextGeneration = 0
  let disposed = false

  const clearDocument = (document: TextDocument) => {
    collection.delete(document.uri)
    contrastDiagnosticStore.delete(document.uri)
  }

  const cancelPending = (key: string) => {
    const timer = timers.get(key)
    if (timer) {
      clearTimeout(timer)
      timers.delete(key)
    }
    const token = tokens.get(key)
    if (token) {
      token.cancel()
      token.dispose()
      tokens.delete(key)
    }
    activeGenerations.delete(key)
  }

  const canPublish = (
    key: string,
    generation: number,
    source: CancellationTokenSource,
    latest: TextDocument | undefined,
    version: number,
  ): latest is TextDocument =>
    !disposed &&
    !source.token.isCancellationRequested &&
    activeGenerations.get(key) === generation &&
    Boolean(latest) &&
    latest?.version === version &&
    shouldDiagnose(latest)

  const canReportFailure = (
    key: string,
    generation: number,
    source: CancellationTokenSource | undefined,
    latest: TextDocument | undefined,
    version: number | undefined,
  ): latest is TextDocument =>
    Boolean(latest) &&
    !disposed &&
    !source?.token.isCancellationRequested &&
    activeGenerations.get(key) === generation &&
    latest?.version === version

  const diagnoseLatest = async (key: string, generation: number) => {
    if (activeGenerations.get(key) !== generation) {
      return
    }
    timers.delete(key)
    let document: TextDocument | undefined
    let source: CancellationTokenSource | undefined
    let version: number | undefined
    try {
      document = findOpenDocument(key)
      if (!document || !shouldDiagnose(document) || disposed) {
        if (document) {
          clearDocument(document)
        }
        return
      }

      source = new CancellationTokenSource()
      tokens.set(key, source)
      version = document.version
      const text = document.getText()
      const pairs = await findContrastPairs(text, {
        signal: source.token,
        languageId: document.languageId,
        filePath: key,
        namedColorMatchMode: config.namedColorMatchMode,
        tailwindColorMode: config.tailwindColorMode,
        tailwindStylesheetPaths: config.tailwindStylesheetPaths,
        resolveScssVariablesAcrossFiles: config.resolveScssVariablesAcrossFiles,
        scssLoadPaths: config.scssLoadPaths,
        resolveCssVariablesAcrossFiles: config.resolveCssVariablesAcrossFiles,
        cssVariablePaths: config.cssVariablePaths,
        cssVariableTrustedSelectors: config.cssVariableTrustedSelectors,
        designTokenJsonMode: config.designTokenJsonMode,
        resolveDesignTokensAcrossFiles: config.resolveDesignTokensAcrossFiles,
        useARGB: config.useARGB,
        workspaceIsTrusted: workspace.isTrusted,
      })
      const latest = findOpenDocument(key)
      if (!canPublish(key, generation, source, latest, version)) {
        return
      }

      const entries = createContrastDiagnosticEntries(latest, pairs)
      contrastDiagnosticStore.set(latest.uri, version, entries)
      collection.set(
        latest.uri,
        entries.map(entry => entry.diagnostic),
      )
    } catch (error) {
      const latest = findOpenDocument(key)
      if (canReportFailure(key, generation, source, latest, version)) {
        clearDocument(latest)
        logger.error(`Contrast diagnostics failed for ${key}: ${error}`)
      }
    } finally {
      if (source && tokens.get(key) === source) {
        tokens.delete(key)
        source.dispose()
      }
      if (activeGenerations.get(key) === generation) {
        activeGenerations.delete(key)
      }
    }
  }

  const schedule = (document: TextDocument) => {
    const key = document.uri.toString()
    cancelPending(key)
    if (!shouldDiagnose(document)) {
      clearDocument(document)
      return
    }
    const generation = ++nextGeneration
    activeGenerations.set(key, generation)
    timers.set(
      key,
      setTimeout(async () => {
        try {
          await diagnoseLatest(key, generation)
        } catch (error) {
          logger.error(`Contrast diagnostics scheduling failed: ${error}`)
        }
      }, DIAGNOSTIC_DEBOUNCE_MS),
    )
  }

  const clearAll = () => {
    for (const key of new Set([
      ...activeGenerations.keys(),
      ...timers.keys(),
      ...tokens.keys(),
    ])) {
      cancelPending(key)
    }
    collection.clear()
    contrastDiagnosticStore.clear()
  }

  const scheduleAll = () => {
    if (!config.enableContrastDiagnostics) {
      clearAll()
      return
    }
    for (const document of workspace.textDocuments) {
      schedule(document)
    }
  }

  const stopWatch = watch(
    () =>
      JSON.stringify({
        dependencyRevision: dependencyRevision.value,
        enable: config.enable,
        enableContrastDiagnostics: config.enableContrastDiagnostics,
        languages: config.languages,
        maxFileSize: config.maxFileSize,
        namedColorMatchMode: config.namedColorMatchMode,
        tailwindColorMode: config.tailwindColorMode,
        tailwindStylesheetPaths: config.tailwindStylesheetPaths,
        resolveScssVariablesAcrossFiles: config.resolveScssVariablesAcrossFiles,
        scssLoadPaths: config.scssLoadPaths,
        resolveCssVariablesAcrossFiles: config.resolveCssVariablesAcrossFiles,
        cssVariablePaths: config.cssVariablePaths,
        cssVariableTrustedSelectors: config.cssVariableTrustedSelectors,
        designTokenJsonMode: config.designTokenJsonMode,
        resolveDesignTokensAcrossFiles: config.resolveDesignTokensAcrossFiles,
        useARGB: config.useARGB,
      }),
    scheduleAll,
    { immediate: true },
  )
  const openDisposable = workspace.onDidOpenTextDocument(schedule)
  const changeDisposable = workspace.onDidChangeTextDocument(event =>
    schedule(event.document),
  )
  const closeDisposable = workspace.onDidCloseTextDocument(document => {
    cancelPending(document.uri.toString())
    clearDocument(document)
  })
  const providerDisposable = languages.registerCodeActionsProvider(
    [{ language: '*' }],
    createContrastCodeActionProvider(contrastDiagnosticStore),
    { providedCodeActionKinds: [CodeActionKind.QuickFix] },
  )

  onDeactivate(() => {
    if (disposed) {
      return
    }
    disposed = true
    stopWatch()
    openDisposable.dispose()
    changeDisposable.dispose()
    closeDisposable.dispose()
    providerDisposable.dispose()
    clearAll()
    collection.dispose()
  })
}

function findOpenDocument(uri: string): TextDocument | undefined {
  return workspace.textDocuments.find(
    document => document.uri.toString() === uri,
  )
}

function shouldDiagnose(document: TextDocument): boolean {
  if (
    !config.enableContrastDiagnostics ||
    !config.enable ||
    !shouldTrackDocument(document) ||
    !shouldProcessLanguage(document.languageId, config.languages)
  ) {
    return false
  }
  const text = document.getText()
  return config.maxFileSize <= 0 || text.length <= config.maxFileSize
}
