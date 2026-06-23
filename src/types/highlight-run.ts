import type { NestedScopedConfigs } from '../meta'

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
  | 'resolveScssVariablesAcrossFiles'
  | 'scssLoadPaths'
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

  /**
   * Whether SCSS strategies may read dependencies from disk.
   */
  readonly resolveScssVariablesAcrossFiles: HighlightRunConfig['resolveScssVariablesAcrossFiles']

  /**
   * Additional Sass load paths for SCSS dependency resolution.
   */
  readonly scssLoadPaths: HighlightRunConfig['scssLoadPaths']

  /**
   * Whether to emit debug log messages.
   */
  readonly debug: boolean
}
