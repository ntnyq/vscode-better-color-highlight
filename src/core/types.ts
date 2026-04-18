/**
 * A detected color match in document text.
 * Pure data — no VS Code dependency.
 */
export interface ColorMatch {
  /** Start offset in the document text (inclusive) */
  readonly start: number
  /** End offset in the document text (exclusive) */
  readonly end: number
  /**
   * The resolved color as a CSS rgb()/rgba() string, e.g. "rgb(255, 0, 0)".
   * Used as the decoration key and for contrast calculation.
   */
  readonly color: string
}

/**
 * A color detection strategy. Pure function — no VS Code API coupling.
 *
 * @param text - The full document text
 * @param context - Optional strategy-specific context
 * @returns Array of color matches found in the text
 */
export type ColorDetector = (
  text: string,
  context?: StrategyContext,
) => ColorMatch[] | Promise<ColorMatch[]>

/**
 * Context passed to strategies that may need additional info.
 */
export interface StrategyContext {
  /** The document's language ID (e.g., "css", "scss") */
  languageId: string
  /** The document's URI fsPath, for variable resolution strategies */
  filePath?: string
}

/**
 * Marker type for decoration styling.
 */
export type MarkerType =
  | 'background'
  | 'outline'
  | 'foreground'
  | 'underline'
  | 'dot-before'
  | 'dot-after'

/**
 * Grouped color matches keyed by their resolved color string.
 */
export type ColorMatchGroup = Record<string, ColorMatch[]>

/**
 * Configuration shape for strategy selection.
 */
export interface HighlightConfig {
  enable: boolean
  languages: string[]
  matchWords: boolean
  useARGB: boolean
  matchRgbWithNoFunction: boolean
  rgbWithNoFunctionLanguages: string[]
  matchHslWithNoFunction: boolean
  hslWithNoFunctionLanguages: string[]
  markerType: MarkerType
  markRuler: boolean
  debug: boolean
}

/**
 * CSS/Sass language IDs that are treated as style languages.
 */
export const STYLE_LANGUAGES = new Set([
  'css',
  'scss',
  'sass',
  'less',
  'stylus',
  'styl',
])
