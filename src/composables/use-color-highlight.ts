import {
  useVisibleTextEditors,
  useDocumentText,
  onDeactivate,
  watch,
  ref,
  type Ref,
} from 'reactive-vscode'
import type { TextEditor, Range } from 'vscode'
import { Range as VscodeRange } from 'vscode'
import { config } from '../config'
import { getStrategies, shouldProcessLanguage } from '../core/strategy-registry'
import { DecorationTypeCache } from '../decorations/decoration-type'
import type {
  ColorMatch,
  ColorMatchGroup,
  HighlightRunConfig,
  MarkerType,
  Disposable,
  StrategyRunOptions,
} from '../types'
import { groupByColor } from '../utils/color-match'
import { shouldTrackEditor } from '../utils/editor-filter'
import { logger } from '../utils/logger'

/**
 * Create a stable signature for the current text revision, language, and config.
 *
 * @param textRevision - The current debounced document text revision
 * @param languageId - The document language ID
 * @param highlightConfig - The highlight configuration snapshot
 * @returns Serialized signature for detecting unchanged highlight runs
 */
function createHighlightRunSignature(
  textRevision: number,
  languageId: string,
  highlightConfig: HighlightRunConfig,
): string {
  return JSON.stringify({
    textRevision,
    languageId,
    enable: highlightConfig.enable,
    languages: highlightConfig.languages,
    useARGB: highlightConfig.useARGB,
    matchWords: highlightConfig.matchWords,
    namedColorMatchMode: highlightConfig.namedColorMatchMode,
    resolveScssVariablesAcrossFiles:
      highlightConfig.resolveScssVariablesAcrossFiles,
    scssLoadPaths: highlightConfig.scssLoadPaths,
    resolveCssVariablesAcrossFiles:
      highlightConfig.resolveCssVariablesAcrossFiles,
    cssVariablePaths: highlightConfig.cssVariablePaths,
    cssVariableTrustedSelectors: highlightConfig.cssVariableTrustedSelectors,
    designTokenJsonMode: highlightConfig.designTokenJsonMode,
    matchRgbWithNoFunction: highlightConfig.matchRgbWithNoFunction,
    rgbWithNoFunctionLanguages: highlightConfig.rgbWithNoFunctionLanguages,
    matchHslWithNoFunction: highlightConfig.matchHslWithNoFunction,
    hslWithNoFunctionLanguages: highlightConfig.hslWithNoFunctionLanguages,
    markerType: highlightConfig.markerType,
    markRuler: highlightConfig.markRuler,
  })
}

/**
 * Debounce helper: delays updating a ref until after `ms` milliseconds
 * of silence following the last invocation.
 *
 * @param source - The reactive ref to debounce
 * @param ms - The debounce delay in milliseconds
 * @returns A debounced ref that updates after the specified delay
 */
function useDebouncedRef<T>(source: Ref<T>, ms: number): Disposable<Ref<T>> {
  const debounced = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const stopWatch = watch(
    source,
    value => {
      if (disposed) {
        return
      }
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        debounced.value = value
      }, ms)
    },
    { immediate: true },
  )

  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    stopWatch()
  }

  return Object.assign(debounced, { dispose })
}

/**
 * Run all applicable strategies on the given text.
 * Uses Promise.all for async strategies (fixes reference repo Promise.race bug).
 *
 * @param options - Strategy run options
 * @returns Flat array of all color matches from all strategies
 */
async function runStrategies(
  options: StrategyRunOptions,
): Promise<ColorMatch[]> {
  const {
    text,
    languageId,
    filePath,
    namedColorMatchMode,
    resolveScssVariablesAcrossFiles,
    scssLoadPaths,
    resolveCssVariablesAcrossFiles,
    cssVariablePaths,
    cssVariableTrustedSelectors,
    designTokenJsonMode,
    useARGB,
    debug,
  } = options

  if (!config.enable) {
    return []
  }

  const strategies = getStrategies(languageId, config)

  if (debug) {
    logger.info(
      `[debug] Running ${strategies.length} strategies for language: ${languageId}`,
    )
  }

  const results = await Promise.all(
    strategies.map(async fn => {
      const strategyName = fn.name || 'anonymous'
      const matches = await fn(text, {
        languageId,
        filePath,
        namedColorMatchMode,
        resolveScssVariablesAcrossFiles,
        scssLoadPaths,
        resolveCssVariablesAcrossFiles,
        cssVariablePaths,
        cssVariableTrustedSelectors,
        designTokenJsonMode,
        useARGB,
      })
      if (debug && matches.length > 0) {
        logger.info(
          `[debug] Strategy "${strategyName}" found ${matches.length} matches`,
        )
      }
      return matches
    }),
  )

  return results.flat()
}

/**
 * Main composable: sets up color highlighting for all visible text editors.
 *
 * Reactive pipeline:
 * 1. `useVisibleTextEditors()` tracks which editors are visible
 * 2. For each editor, `useDocumentText()` provides reactive document text
 * 3. Text changes are debounced (100ms) to avoid processing every keystroke
 * 4. Strategies are run on the debounced text
 * 5. Results are grouped by color and applied as decorations
 */
export function useColorHighlight() {
  const visibleEditors = useVisibleTextEditors()

  // Track per-editor state
  const editorStates = new Map<
    string,
    {
      cache: DecorationTypeCache
      dispose: () => void
    }
  >()

  // Watch for visible editor changes
  watch(
    visibleEditors,
    editors => {
      const trackedEditors = editors.filter(shouldTrackEditor)
      const currentKeys = new Set(trackedEditors.map(getEditorKey))

      // Remove stale editors
      for (const [key, state] of editorStates) {
        if (!currentKeys.has(key)) {
          state.cache.dispose()
          state.dispose()
          editorStates.delete(key)
        }
      }

      // Set up new editors
      for (const editor of trackedEditors) {
        const key = getEditorKey(editor)
        if (editorStates.has(key)) {
          continue
        }

        const cache = new DecorationTypeCache()
        const disposables: (() => void)[] = []

        setupEditorTracking(editor, cache, disposables)

        editorStates.set(key, {
          cache,
          dispose: () => {
            for (const fn of disposables) {
              fn()
            }
          },
        })
      }
    },
    { immediate: true },
  )

  onDeactivate(() => {
    for (const state of editorStates.values()) {
      state.cache.dispose()
      state.dispose()
    }
    editorStates.clear()
  })
}

/**
 * Set up reactive tracking for a single text editor.
 *
 * @param editor - The VS Code text editor to track
 * @param cache - The decoration type cache for this editor
 * @param disposables - Array to push cleanup functions into
 */
function setupEditorTracking(
  editor: TextEditor,
  cache: DecorationTypeCache,
  disposables: (() => void)[],
) {
  const doc = editor.document
  const textRef = useDocumentText(doc)

  // Debounce text changes (100ms)
  const debouncedText = useDebouncedRef(textRef, 100)
  const debouncedTextRevision = ref(0)
  const stopRevisionWatch = watch(
    debouncedText,
    () => {
      debouncedTextRevision.value++
    },
    { immediate: true },
  )

  // Track the current config for this editor
  let pendingVersion = 0
  let lastRunSignature: string | undefined

  // Watch debounced text and apply decorations
  const stopWatch = watch(
    () =>
      createHighlightRunSignature(
        debouncedTextRevision.value,
        doc.languageId,
        config,
      ),
    async runSignature => {
      if (runSignature === lastRunSignature) {
        if (config.debug) {
          logger.info(
            `[debug] Skipping unchanged run for ${doc.uri.fsPath} (language: ${doc.languageId})`,
          )
        }
        return
      }
      lastRunSignature = runSignature

      // Any changed run signature invalidates older async strategy results,
      // even if this run exits early after clearing decorations.
      pendingVersion++
      const thisVersion = pendingVersion
      const text = debouncedText.value

      if (!text) {
        clearDecorations(editor, cache)
        return
      }

      // Check if this language should be processed
      if (!shouldProcessLanguage(doc.languageId, config.languages)) {
        if (config.debug) {
          logger.info(
            `[debug] Skipping ${doc.uri.fsPath} — language "${doc.languageId}" not in configured languages: ${JSON.stringify(config.languages)}`,
          )
        }
        clearDecorations(editor, cache)
        return
      }

      if (!config.enable) {
        if (config.debug) {
          logger.info(
            `[debug] Skipping ${doc.uri.fsPath} — highlighting is disabled`,
          )
        }
        clearDecorations(editor, cache)
        return
      }

      if (config.debug) {
        logger.info(
          `[debug] Processing ${doc.uri.fsPath} (language: ${doc.languageId}, text length: ${text.length}, version: ${thisVersion})`,
        )
      }

      try {
        const matches = await runStrategies({
          text,
          languageId: doc.languageId,
          filePath: doc.uri.toString(),
          namedColorMatchMode: config.namedColorMatchMode,
          resolveScssVariablesAcrossFiles:
            config.resolveScssVariablesAcrossFiles,
          scssLoadPaths: config.scssLoadPaths,
          resolveCssVariablesAcrossFiles: config.resolveCssVariablesAcrossFiles,
          cssVariablePaths: config.cssVariablePaths,
          cssVariableTrustedSelectors: config.cssVariableTrustedSelectors,
          designTokenJsonMode: config.designTokenJsonMode,
          useARGB: config.useARGB,
          debug: config.debug,
        })

        // Guard: discard stale results if document changed while strategies ran
        if (thisVersion !== pendingVersion) {
          if (config.debug) {
            logger.info(
              `[debug] Discarding stale results for ${doc.uri.fsPath} (version ${thisVersion} != ${pendingVersion})`,
            )
          }
          return
        }

        const groups = groupByColor(matches)

        if (config.debug) {
          const colorCount = Object.keys(groups).length
          const matchCount = matches.length
          logger.info(
            `[debug] Found ${matchCount} matches with ${colorCount} unique colors in ${doc.uri.fsPath}`,
          )
          for (const [color, colorMatches] of Object.entries(groups)) {
            logger.info(
              `[debug]   ${color}: ${colorMatches.length} occurrence(s)`,
            )
          }
        }

        applyDecorations(
          editor,
          cache,
          groups,
          config.markerType,
          config.markRuler,
          config.debug,
        )
      } catch (error) {
        // Allow retry for the same text/config if a run fails unexpectedly.
        lastRunSignature = undefined
        logger.error(`Color detection failed: ${error}`)
      }
    },
    { immediate: true },
  )

  disposables.push(debouncedText.dispose, stopRevisionWatch, stopWatch)
}

/**
 * Apply color match groups as decorations to the editor.
 * Each unique color gets its own TextEditorDecorationType.
 *
 * @param editor - The VS Code text editor to decorate
 * @param cache - The decoration type cache
 * @param groups - Color matches grouped by color string
 * @param markerType - The decoration style to use
 * @param markRuler - Whether to show markers in the overview ruler
 * @param debug - Whether to emit debug log messages
 */
function applyDecorations(
  editor: TextEditor,
  cache: DecorationTypeCache,
  groups: ColorMatchGroup,
  markerType: MarkerType,
  markRuler: boolean,
  debug: boolean,
) {
  const doc = editor.document

  if (debug) {
    logger.info(
      `[debug] Applying decorations: markerType=${markerType}, markRuler=${markRuler}, colors=${Object.keys(groups).length}`,
    )
  }

  // Clear existing decorations first to avoid accumulation
  // Get all current decoration types from the cache
  const existingDecorationTypes = cache.getAll()

  // Clear each existing decoration type
  for (const decorationType of existingDecorationTypes) {
    editor.setDecorations(decorationType, [])
  }

  // Apply new decorations
  for (const [color, matches] of Object.entries(groups)) {
    const decorationType = cache.getOrCreate(color, markerType, markRuler)
    const ranges: Range[] = matches.map(
      m => new VscodeRange(doc.positionAt(m.start), doc.positionAt(m.end)),
    )
    editor.setDecorations(decorationType, ranges)
  }

  cache.disposeStale(Object.keys(groups), markerType, markRuler)
}

/**
 * Clear all decorations from an editor by disposing the decoration cache.
 *
 * @param editor - The VS Code text editor whose decorations should be cleared
 * @param cache - The decoration type cache to clear
 */
function clearDecorations(editor: TextEditor, cache: DecorationTypeCache) {
  // Clear all currently tracked decoration types from the editor.
  for (const decorationType of cache.getAll()) {
    editor.setDecorations(decorationType, [])
  }

  // Then dispose and clear the cache.
  cache.clear()
}

/**
 * Get a unique key for a text editor based on its document URI and view column.
 *
 * @param editor - The VS Code text editor
 * @returns A unique string key for the editor
 */
function getEditorKey(editor: TextEditor): string {
  return `${editor.document.uri.toString()}:${editor.viewColumn ?? 0}`
}
