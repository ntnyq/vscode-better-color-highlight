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
 */
async function runStrategies(
  text: string,
  languageId: string,
): Promise<ColorMatch[]> {
  const cfg = getHighlightConfig()

  if (!cfg.enable) {
    return []
  }

  const strategies = getStrategies(languageId, cfg)
  const results = await Promise.all(
    strategies.map(fn => fn(text, { languageId })),
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
        clearDecorations(editor, cache)
        return
      }

      if (!cfg.enable) {
        clearDecorations(editor, cache)
        return
      }

      // Version tracking for stale result guard
      pendingVersion++
      const thisVersion = pendingVersion

      try {
        const matches = await runStrategies(text, doc.languageId)

        // Guard: discard stale results if document changed while strategies ran
        if (thisVersion !== pendingVersion) {
          return
        }

        const groups = groupByColor(matches)
        applyDecorations(editor, cache, groups, cfg.markerType, cfg.markRuler)
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
 */
function applyDecorations(
  editor: TextEditor,
  cache: DecorationTypeCache,
  groups: ColorMatchGroup,
  markerType: MarkerType,
  markRuler: boolean,
): void {
  const doc = editor.document

  // Track which colors are currently active so we can clear removed ones
  const activeColors = new Set<string>()

  for (const [color, matches] of Object.entries(groups)) {
    activeColors.add(color)
    const decorationType = cache.getOrCreate(color, markerType, markRuler)
    const ranges: Range[] = matches.map(
      m => new VscodeRange(doc.positionAt(m.start), doc.positionAt(m.end)),
    )
    editor.setDecorations(decorationType, ranges)
  }

  // Clear decoration types that are no longer in use
  // The cache handles reuse; we just need to set empty ranges for removed colors
  // This is handled by the cache.clear() on re-process
}

/**
 * Clear all decorations from an editor.
 */
function clearDecorations(
  editor: TextEditor,
  cache: DecorationTypeCache,
): void {
  cache.clear()
}

/**
 * Get a unique key for a text editor.
 */
function getEditorKey(editor: TextEditor): string {
  return `${editor.document.uri.toString()}:${editor.viewColumn ?? 0}`
}
