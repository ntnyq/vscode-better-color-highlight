/**
 * A detected color match in document text.
 * Pure data — no VS Code dependency.
 */
export interface ColorMatch {
  /**
   * Start offset in the document text (inclusive).
   */
  readonly start: number

  /**
   * End offset in the document text (exclusive).
   */
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
  /**
   * The document's language ID, e.g. "css" or "scss".
   */
  languageId: string

  /**
   * The document URI string or local file path for variable resolution strategies.
   */
  filePath?: string

  /**
   * How named CSS colors should be matched.
   */
  namedColorMatchMode?: NamedColorMatchMode

  /**
   * Whether SCSS @use/@forward/@import dependencies may be read from disk.
   */
  resolveScssVariablesAcrossFiles?: boolean

  /**
   * Additional Sass load paths for resolving non-relative SCSS modules.
   */
  scssLoadPaths?: string[]

  /**
   * Whether CSS custom properties may be resolved from configured files.
   */
  resolveCssVariablesAcrossFiles?: boolean

  /**
   * File, directory, or glob paths used as CSS custom property sources.
   */
  cssVariablePaths?: string[]

  /**
   * Selectors trusted for cross-file CSS custom property resolution.
   */
  cssVariableTrustedSelectors?: string[]

  /**
   * How JSON and JSONC design token colors should be matched.
   */
  designTokenJsonMode?: DesignTokenJsonMode
}

/**
 * Supported named-color matching modes.
 */
export type NamedColorMatchMode = 'context' | 'always' | 'never'

/**
 * JSON design token color matching modes.
 */
export type DesignTokenJsonMode = 'token-values' | 'strings' | 'all' | 'off'

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
