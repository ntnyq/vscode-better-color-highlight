import type { NestedScopedConfigs } from '../meta'
import type { CancellationSignal } from './color-highlight'

/**
 * Configuration fields that affect a single highlight run.
 */
export type HighlightRunConfig = Pick<
  NestedScopedConfigs,
  | 'enable'
  | 'languages'
  | 'useARGB'
  | 'matchWords'
  | 'namedColorMatchMode'
  | 'tailwindColorMode'
  | 'tailwindStylesheetPaths'
  | 'resolveScssVariablesAcrossFiles'
  | 'scssLoadPaths'
  | 'resolveCssVariablesAcrossFiles'
  | 'cssVariablePaths'
  | 'cssVariableTrustedSelectors'
  | 'maxFileSize'
  | 'designTokenJsonMode'
  | 'resolveDesignTokensAcrossFiles'
  | 'matchRgbWithNoFunction'
  | 'rgbWithNoFunctionLanguages'
  | 'matchHslWithNoFunction'
  | 'hslWithNoFunctionLanguages'
  | 'markerType'
  | 'markRuler'
>

/**
 * Options used when running color detection strategies.
 */
export interface StrategyRunOptions {
  /** Cancellation state for a superseded editor scan. */
  readonly signal: CancellationSignal

  /**
   * The document text to analyze.
   */
  readonly text: string

  /**
   * The language identifier for strategy selection.
   */
  readonly languageId: string

  /**
   * The current document file path.
   */
  readonly filePath?: string

  /**
   * The named-color matching mode to pass to strategies.
   */
  readonly namedColorMatchMode: HighlightRunConfig['namedColorMatchMode']

  /** Tailwind palette compatibility mode. */
  readonly tailwindColorMode: HighlightRunConfig['tailwindColorMode']

  /** Configured Tailwind CSS theme source paths. */
  readonly tailwindStylesheetPaths: HighlightRunConfig['tailwindStylesheetPaths']

  /**
   * Whether SCSS strategies may read dependencies from disk.
   */
  readonly resolveScssVariablesAcrossFiles: HighlightRunConfig['resolveScssVariablesAcrossFiles']

  /**
   * Additional Sass load paths for SCSS dependency resolution.
   */
  readonly scssLoadPaths: HighlightRunConfig['scssLoadPaths']

  /**
   * Whether CSS custom properties may be resolved from configured files.
   */
  readonly resolveCssVariablesAcrossFiles: HighlightRunConfig['resolveCssVariablesAcrossFiles']

  /**
   * File, directory, or glob paths used as CSS custom property sources.
   */
  readonly cssVariablePaths: HighlightRunConfig['cssVariablePaths']

  /**
   * Selectors trusted for cross-file CSS custom property resolution.
   */
  readonly cssVariableTrustedSelectors: HighlightRunConfig['cssVariableTrustedSelectors']

  /**
   * How JSON and JSONC design token colors should be matched.
   */
  readonly designTokenJsonMode: HighlightRunConfig['designTokenJsonMode']

  /** Whether relative design-token references may be resolved across files. */
  readonly resolveDesignTokensAcrossFiles: HighlightRunConfig['resolveDesignTokensAcrossFiles']

  /**
   * Whether 8-digit hex colors should be interpreted as ARGB.
   */
  readonly useARGB: HighlightRunConfig['useARGB']

  /**
   * Whether the current workspace is trusted for cross-file reads.
   */
  readonly workspaceIsTrusted: boolean

  /**
   * Whether to emit debug log messages.
   */
  readonly debug: boolean
}
