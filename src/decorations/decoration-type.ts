import { window, type TextEditorDecorationType } from 'vscode'
import type { MarkerType } from '../core/types'
import { buildDecorationOptions } from './marker-types'

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
    const key = `${markerType}:${color}:${markRuler}`
    let type = this.cache.get(key)
    if (!type) {
      const options = buildDecorationOptions(markerType, color, markRuler)
      type = window.createTextEditorDecorationType(options)
      this.cache.set(key, type)
    }
    return type
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
