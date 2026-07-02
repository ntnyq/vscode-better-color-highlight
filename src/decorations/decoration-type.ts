import { window, type TextEditorDecorationType } from 'vscode'
import type { MarkerType } from '../types'
import { buildDecorationOptions } from './marker-types'

/**
 * Build the stable cache key for one decoration type.
 *
 * @param color - The CSS rgb() color string
 * @param markerType - The decoration style
 * @param markRuler - Whether to show the color in the overview ruler
 * @returns Decoration cache key
 */
function createDecorationTypeKey(
  color: string,
  markerType: MarkerType,
  markRuler: boolean,
): string {
  return `${markerType}:${color}:${markRuler}`
}

/**
 * Manages a cache of TextEditorDecorationType instances keyed by color + marker type.
 * Each unique (color, markerType, markRuler) triple gets its own decoration type.
 *
 * The cache is lazily populated and must be disposed when no longer needed.
 */
export class DecorationTypeCache {
  /**
   * Cached decoration types keyed by marker type, color, and ruler setting.
   */
  private cache = new Map<string, TextEditorDecorationType>()

  /**
   * Get or create a decoration type for the given color and marker configuration.
   *
   * @param color - The CSS rgb() color string
   * @param markerType - The decoration style
   * @param markRuler - Whether to show the color in the overview ruler
   * @returns The cached or newly created TextEditorDecorationType
   */
  public getOrCreate(
    color: string,
    markerType: MarkerType,
    markRuler: boolean,
  ): TextEditorDecorationType {
    const key = createDecorationTypeKey(color, markerType, markRuler)
    let type = this.cache.get(key)
    if (!type) {
      const options = buildDecorationOptions(markerType, color, markRuler)
      type = window.createTextEditorDecorationType(options)
      this.cache.set(key, type)
    }
    return type
  }

  /**
   * Dispose cached decoration types that are absent from the active set.
   *
   * @param colors - Colors used by the latest decoration run
   * @param markerType - The active decoration style
   * @param markRuler - Whether the active run marks the overview ruler
   */
  public disposeStale(
    colors: readonly string[],
    markerType: MarkerType,
    markRuler: boolean,
  ) {
    const activeKeys = new Set(
      colors.map(color =>
        createDecorationTypeKey(color, markerType, markRuler),
      ),
    )

    for (const [key, type] of this.cache) {
      if (activeKeys.has(key)) {
        continue
      }

      type.dispose()
      this.cache.delete(key)
    }
  }

  /**
   * Dispose all cached decoration types and clear the cache.
   */
  public clear() {
    for (const type of this.cache.values()) {
      type.dispose()
    }
    this.cache.clear()
  }

  /**
   * Dispose the cache. Alias for clear().
   */
  public dispose() {
    this.clear()
  }

  /**
   * Get all cached decoration types.
   * @returns Array of TextEditorDecorationType instances
   */
  public getAll(): TextEditorDecorationType[] {
    return [...this.cache.values()]
  }
}
