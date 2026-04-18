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
import { getHighlightConfig } from '../config'
import { groupByColor } from '../core/color-match'
import { getStrategies, shouldProcessLanguage } from '../core/strategy-registry'
import type { ColorMatch, ColorMatchGroup, MarkerType } from '../core/types'
import { DecorationTypeCache } from '../decorations/decoration-type'
import { logger } from '../utils/logger'

/**
 * Debounce helper: delays updating a ref until after `ms` milliseconds
 * of silence following the last invocation.
 *
 * @param source - The reactive ref to debounce
 * @param ms - The debounce delay in milliseconds
 * @returns A debounced ref that updates after the specified delay
 */
function useDebouncedRef<T>(source: Ref<T>, ms: number): Ref<T> {
  const debounced = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(
    source,
    value => {
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        debounced.value = value
      }, ms)
    },
    { immediate: true },
  )

  onDeactivate(() => {
    if (timer) {
      clearTimeout(timer)
    }
  })

  return debounced
}

/**
 * Run all applicable strategies on the given text.
 * Uses Promise.all for async strategies (fixes reference repo Promise.race bug).
 *
 * @param text - The document text to analyze
 * @param languageId - The language identifier for strategy selection
 * @param debug - Whether to emit debug log messages
 * @returns Flat array of all color matches from all strategies
 */
async function runStrategies(
  text: string,
  languageId: string,
  debug: boolean,
): Promise<ColorMatch[]> {
  const cfg = getHighlightConfig()

  if (!cfg.enable) {
    return []
  }

  const strategies = getStrategies(languageId, cfg)

  if (debug) {
    logger.info(
      `[debug] Running ${strategies.length} strategies for language: ${languageId}`,
    )
  }

  const results = await Promise.all(
    strategies.map(async fn => {
      const strategyName = fn.name || 'anonymous'
      const matches = await fn(text, { languageId })
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
export function useColorHighlight(): void {
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
      const currentKeys = new Set(editors.map(getEditorKey))

      // Remove stale editors
      for (const [key, state] of editorStates) {
        if (!currentKeys.has(key)) {
          state.cache.dispose()
          state.dispose()
          editorStates.delete(key)
        }
      }

      // Set up new editors
      for (const editor of editors) {
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
): void {
  const doc = editor.document
  const textRef = useDocumentText(doc)

  // Debounce text changes (100ms)
  const debouncedText = useDebouncedRef(textRef, 100)

  // Track the current config for this editor
  let pendingVersion = 0

  // Watch debounced text and apply decorations
  const stopWatch = watch(
    debouncedText,
    async text => {
      if (!text) {
        clearDecorations(editor, cache)
        return
      }

      const cfg = getHighlightConfig()

      // Check if this language should be processed
      if (!shouldProcessLanguage(doc.languageId, cfg.languages)) {
        if (cfg.debug) {
          logger.info(
            `[debug] Skipping ${doc.uri.fsPath} — language "${doc.languageId}" not in configured languages: ${JSON.stringify(cfg.languages)}`,
          )
        }
        clearDecorations(editor, cache)
        return
      }

      if (!cfg.enable) {
        if (cfg.debug) {
          logger.info(
            `[debug] Skipping ${doc.uri.fsPath} — highlighting is disabled`,
          )
        }
        clearDecorations(editor, cache)
        return
      }

      // Version tracking for stale result guard
      pendingVersion++
      const thisVersion = pendingVersion

      if (cfg.debug) {
        logger.info(
          `[debug] Processing ${doc.uri.fsPath} (language: ${doc.languageId}, text length: ${text.length}, version: ${thisVersion})`,
        )
      }

      try {
        const matches = await runStrategies(text, doc.languageId, cfg.debug)

        // Guard: discard stale results if document changed while strategies ran
        if (thisVersion !== pendingVersion) {
          if (cfg.debug) {
            logger.info(
              `[debug] Discarding stale results for ${doc.uri.fsPath} (version ${thisVersion} != ${pendingVersion})`,
            )
          }
          return
        }

        const groups = groupByColor(matches)

        if (cfg.debug) {
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
          cfg.markerType,
          cfg.markRuler,
          cfg.debug,
        )
      } catch (error) {
        logger.error(`Color detection failed: ${error}`)
      }
    },
    { immediate: true },
  )

  disposables.push(stopWatch)
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
): void {
  const doc = editor.document

  if (debug) {
    logger.info(
      `[debug] Applying decorations: markerType=${markerType}, markRuler=${markRuler}, colors=${Object.keys(groups).length}`,
    )
  }

  for (const [color, matches] of Object.entries(groups)) {
    const decorationType = cache.getOrCreate(color, markerType, markRuler)
    const ranges: Range[] = matches.map(
      m => new VscodeRange(doc.positionAt(m.start), doc.positionAt(m.end)),
    )
    editor.setDecorations(decorationType, ranges)
  }
}

/**
 * Clear all decorations from an editor by disposing the decoration cache.
 *
 * @param _editor - The VS Code text editor (unused, kept for API consistency)
 * @param cache - The decoration type cache to clear
 */
function clearDecorations(
  editor: TextEditor,
  cache: DecorationTypeCache,
): void {
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
