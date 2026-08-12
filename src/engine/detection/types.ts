import type { WorkspaceReadBudget } from '../../shared/workspace/read-budget'

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

  /** Source syntax used to resolve and safely edit the color. */
  readonly sourceKind?: ColorSourceKind

  /**
   * Whether generic color-editing actions can safely replace the source.
   * Omitted values use the generic editing behavior.
   */
  readonly editMode?: ColorEditMode
}

/** Source-editing behavior supported by a detected color match. */
export type ColorEditMode = 'generic' | 'source' | 'read-only'

/** Source syntaxes that require language-aware presentation behavior. */
export type ColorSourceKind = 'android-xml-hex' | 'compose-argb-hex' | 'dart'

/** Optional concrete RGB overrides for the base ANSI color palette. */
export interface AnsiPaletteOverrides {
  readonly black?: string
  readonly blue?: string
  readonly brightBlack?: string
  readonly brightBlue?: string
  readonly brightCyan?: string
  readonly brightGreen?: string
  readonly brightMagenta?: string
  readonly brightRed?: string
  readonly brightWhite?: string
  readonly brightYellow?: string
  readonly cyan?: string
  readonly green?: string
  readonly magenta?: string
  readonly red?: string
  readonly white?: string
  readonly yellow?: string
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

/** Platform-neutral cancellation state; VS Code tokens satisfy this shape. */
export interface CancellationSignal {
  readonly isCancellationRequested: boolean
}

/**
 * Context passed to strategies that may need additional info.
 */
export interface StrategyContext {
  /** Optional cancellation shared by detector and dependency-loader work. */
  signal?: CancellationSignal

  /** Optional concrete RGB overrides for ANSI palette indexes 0-15. */
  ansiPalette?: AnsiPaletteOverrides
  /**
   * The document's language ID, e.g. "css" or "scss".
   */
  languageId: string

  /** Tailwind palette compatibility mode. */
  tailwindColorMode?: 'auto' | 'v3' | 'v4'

  /** File, directory, or glob paths used as Tailwind CSS theme sources. */
  tailwindStylesheetPaths?: readonly string[]

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
  scssLoadPaths?: readonly string[]

  /**
   * Whether CSS custom properties may be resolved from configured files.
   */
  resolveCssVariablesAcrossFiles?: boolean

  /**
   * File, directory, or glob paths used as CSS custom property sources.
   */
  cssVariablePaths?: readonly string[]

  /**
   * Selectors trusted for cross-file CSS custom property resolution.
   */
  cssVariableTrustedSelectors?: readonly string[]

  /**
   * How JSON and JSONC design token colors should be matched.
   */
  designTokenJsonMode?: DesignTokenJsonMode

  /**
   * Whether relative design-token references may be resolved across files.
   */
  resolveDesignTokensAcrossFiles?: boolean

  /**
   * Whether 8-digit hex colors should be interpreted as ARGB.
   */
  useARGB?: boolean

  /**
   * Whether the current workspace is trusted for cross-file reads.
   */
  workspaceIsTrusted?: boolean

  /** Shared bound for unique workspace dependency reads. */
  workspaceReadBudget?: WorkspaceReadBudget
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
 * Grouped color matches keyed by their resolved color string.
 */
export type ColorMatchGroup = Record<string, ColorMatch[]>
