import type {
  ColorDetector,
  ColorEditMode,
  ColorMatch,
  ColorSourceKind,
  StrategyContext,
} from '../../engine/detection'
import { shouldProcessLanguage } from '../../engine/detection/registry'
import { runColorDetectors } from '../../engine/detection/run-detectors'
import { isArgbSourceKind } from '../../engine/presentation/source-color'
import type { NestedScopedConfigs } from '../../meta'
import {
  getColorPresentations,
  type ColorPresentations,
} from '../../shared/color/presentation'
import { readObjectConfigValue } from '../../shared/config-value'

/**
 * Copy command identifiers keyed by presentation format.
 */
const COPY_COMMANDS = {
  hex: 'color-highlight.copyColorAsHex',
  hsl: 'color-highlight.copyColorAsHsl',
  oklch: 'color-highlight.copyColorAsOklch',
  rgb: 'color-highlight.copyColorAsRgb',
} as const

/**
 * Replace command identifiers keyed by presentation format.
 */
const REPLACE_COMMANDS = {
  hex: 'color-highlight.replaceColorAsHex',
  hsl: 'color-highlight.replaceColorAsHsl',
  oklch: 'color-highlight.replaceColorAsOklch',
  rgb: 'color-highlight.replaceColorAsRgb',
} as const

const ADJUST_ALPHA_COMMAND = 'color-highlight.adjustColorAlpha'
const HOVER_COLUMN_PAD = '\u00A0'
const MAX_COLOR_HOVER_MATCH_CACHE_SIZE = 32

interface CancellationLike {
  readonly isCancellationRequested: boolean
}

/**
 * Successfully completed detector results keyed by document/config revision.
 */
export type ColorHoverMatchCache = Map<string, ColorMatch[]>

/**
 * Hover data for a detected color under the cursor.
 */
export interface ColorHover {
  /** Whether source-editing actions are safe for this match. */
  readonly editMode?: ColorEditMode

  /**
   * Resolved rgb()/rgba() color value for the detected source text.
   */
  readonly originalColor: string

  /**
   * Exact source text covered by the detected color range.
   */
  readonly originalText: string

  /**
   * Copy-ready color representations shown in the hover.
   */
  readonly presentations: ColorPresentations

  /** Language-specific source syntax used by editing adapters. */
  readonly sourceKind?: ColorSourceKind

  /**
   * Source range of the color match in document offsets.
   */
  readonly range: {
    /**
     * Start offset of the color match, inclusive.
     */
    readonly start: number

    /**
     * End offset of the color match, exclusive.
     */
    readonly end: number
  }

  /**
   * URI of the document that produced the hover.
   */
  readonly uri: string
}

/**
 * Inputs required to resolve color hover content for a document offset.
 */
export interface ColorHoverOptions {
  /**
   * Optional cancellation token from VS Code hover requests.
   */
  readonly cancellationToken?: CancellationLike

  /**
   * Current extension configuration snapshot.
   */
  readonly config: NestedScopedConfigs

  /**
   * Color detectors applicable to the current language.
   */
  readonly detectors: readonly ColorDetector[]

  /**
   * Current document URI string or file path.
   */
  readonly filePath: string

  /**
   * VS Code language identifier for the document.
   */
  readonly languageId: string

  /**
   * Optional detector-result cache owned by the hover provider.
   */
  readonly matchCache?: ColorHoverMatchCache

  /**
   * Stable cache key for the document, dependency, and configuration revision.
   */
  readonly matchCacheKey?: string

  /**
   * Document offset where the hover was requested.
   */
  readonly offset: number

  /**
   * Optional detector failure reporter.
   */
  readonly onDetectorError?: (message: string) => void

  /**
   * Full document text to scan.
   */
  readonly text: string

  /**
   * Whether the current workspace is trusted for cross-file reads.
   */
  readonly workspaceIsTrusted?: boolean
}

/**
 * Find hover data for the color match under a document offset.
 *
 * @param options - Hover lookup options.
 * @returns Color hover data, or null when disabled or no color is under offset.
 */
export async function getColorHover(
  options: ColorHoverOptions,
): Promise<ColorHover | null> {
  const {
    cancellationToken,
    config,
    detectors,
    filePath,
    languageId,
    matchCache,
    matchCacheKey,
    onDetectorError,
    offset,
    text,
    workspaceIsTrusted,
  } = options

  if (cancellationToken?.isCancellationRequested) {
    return null
  }

  if (!config.enable || !config.enableHover) {
    return null
  }

  if (!shouldProcessLanguage(languageId, config.languages)) {
    return null
  }

  if (config.maxFileSize > 0 && text.length > config.maxFileSize) {
    return null
  }

  const context: StrategyContext = {
    ansiPalette: readObjectConfigValue(config, 'ansiPalette', {}),
    languageId,
    signal: cancellationToken,
    filePath,
    namedColorMatchMode: config.namedColorMatchMode,
    tailwindColorMode: config.tailwindColorMode,
    tailwindStylesheetPaths: config.tailwindStylesheetPaths,
    resolveScssVariablesAcrossFiles: config.resolveScssVariablesAcrossFiles,
    scssLoadPaths: config.scssLoadPaths,
    resolveCssVariablesAcrossFiles: config.resolveCssVariablesAcrossFiles,
    cssVariablePaths: config.cssVariablePaths,
    cssVariableTrustedSelectors: config.cssVariableTrustedSelectors,
    designTokenJsonMode: config.designTokenJsonMode,
    resolveDesignTokensAcrossFiles: config.resolveDesignTokensAcrossFiles,
    useARGB: config.useARGB,
    workspaceIsTrusted,
  }

  const loadMatches = async (): Promise<ColorMatch[]> =>
    await runColorDetectors({
      context,
      detectors,
      onDetectorError,
      text,
    })
  const cachedMatches =
    matchCache && matchCacheKey ? matchCache.get(matchCacheKey) : undefined
  const matches = cachedMatches ?? (await loadMatches())
  if (cancellationToken?.isCancellationRequested) {
    return null
  }
  if (!cachedMatches && matchCache && matchCacheKey) {
    cacheCompletedMatches(matchCache, matchCacheKey, matches)
  }

  const match = findMatchAtOffset(matches, offset)
  if (!match) {
    return null
  }

  const presentations = getColorPresentations(match.color, {
    useARGB: config.useARGB || isArgbSourceKind(match.sourceKind),
  })
  if (!presentations) {
    return null
  }

  return {
    ...(match.editMode ? { editMode: match.editMode } : {}),
    originalColor: match.color,
    originalText: text.slice(match.start, match.end),
    presentations,
    ...(match.sourceKind ? { sourceKind: match.sourceKind } : {}),
    range: {
      start: match.start,
      end: match.end,
    },
    uri: filePath,
  }
}

function cacheCompletedMatches(
  matchCache: ColorHoverMatchCache,
  matchCacheKey: string,
  matches: ColorMatch[],
): void {
  while (
    !matchCache.has(matchCacheKey) &&
    matchCache.size >= MAX_COLOR_HOVER_MATCH_CACHE_SIZE
  ) {
    const oldestKey = matchCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    matchCache.delete(oldestKey)
  }
  matchCache.set(matchCacheKey, matches)
}

/**
 * Build markdown shown in the VS Code color hover.
 *
 * @param presentations - Color strings to display and copy.
 * @returns Trusted markdown body with command links.
 */
export function buildColorHoverMarkdown(hover: ColorHover): string {
  const { presentations } = hover
  const valueWidth = getHoverValueWidth(hover)
  const lines = [
    '**Color Highlight**',
    '',
    formatPresentationLine('HEX', 'hex', presentations.hex, hover, valueWidth),
    formatPresentationLine('RGB', 'rgb', presentations.rgb, hover, valueWidth),
    formatPresentationLine('HSL', 'hsl', presentations.hsl, hover, valueWidth),
    formatPresentationLine(
      'OKLCH',
      'oklch',
      presentations.oklch,
      hover,
      valueWidth,
    ),
  ]
  if (canEditColor(hover)) {
    lines.push(formatAlphaLine(hover, valueWidth))
  }

  return lines.join('\n\n')
}

/**
 * Get the fixed display width for the hover value column.
 *
 * @param hover - Current hover data.
 * @returns Maximum visible value length in the hover.
 */
function getHoverValueWidth(hover: ColorHover): number {
  const { presentations } = hover

  return Math.max(
    canEditColor(hover) ? presentations.alpha.length : 0,
    presentations.hex.length,
    presentations.hsl.length,
    presentations.oklch.length,
    presentations.rgb.length,
  )
}

/**
 * Format one hover row with a copy command link.
 *
 * @param label - Display label for the color format.
 * @param value - Color value shown and copied.
 * @param command - Copy command invoked by the link.
 * @returns Markdown row for one color presentation.
 */
function formatPresentationLine(
  label: string,
  format: keyof typeof COPY_COMMANDS,
  value: string,
  hover: ColorHover,
  valueWidth: number,
): string {
  const parts = [
    `\`${formatHoverLabel(label)}\``,
    `\`${formatHoverValue(value, valueWidth)}\``,
    `[$(copy)](${buildCommandLink(COPY_COMMANDS[format], value)})`,
  ]
  if (canReplaceColor(hover)) {
    parts.push(
      `[$(replace)](${buildCommandLink(REPLACE_COMMANDS[format], {
        originalText: hover.originalText,
        range: hover.range,
        uri: hover.uri,
        value,
      })})`,
    )
  }

  return parts.join(' ')
}

/** Whether generic replacement and alpha controls are safe for this source. */
function canEditColor(hover: ColorHover): boolean {
  return hover.editMode !== 'read-only'
}

/** Whether generic CSS replacement syntax is valid for this source. */
function canReplaceColor(hover: ColorHover): boolean {
  return canEditColor(hover) && hover.editMode !== 'source'
}

/**
 * Pad hover labels to keep rows visually aligned in inline code.
 *
 * @param label - Color format label.
 * @returns Label padded to the width of OKLCH.
 */
function formatHoverLabel(label: string): string {
  return label.padEnd(5, HOVER_COLUMN_PAD)
}

/**
 * Pad hover values to align action links while preserving command payloads.
 *
 * @param value - Visible color value.
 * @param width - Target display width.
 * @returns Value padded with non-breaking spaces.
 */
function formatHoverValue(value: string, width: number): string {
  return value.padEnd(width, HOVER_COLUMN_PAD)
}

/**
 * Format alpha controls with decrement and increment command links.
 *
 * @param hover - Current hover data.
 * @returns Markdown row for alpha actions.
 */
function formatAlphaLine(hover: ColorHover, valueWidth: number): string {
  const basePayload = {
    originalColor: hover.originalColor,
    originalText: hover.originalText,
    range: hover.range,
    ...(hover.sourceKind ? { sourceKind: hover.sourceKind } : {}),
    uri: hover.uri,
  }

  return [
    '`Alpha`',
    `\`${formatHoverValue(hover.presentations.alpha, valueWidth)}\``,
    `[$(remove)](${buildCommandLink(ADJUST_ALPHA_COMMAND, {
      ...basePayload,
      delta: -0.1,
    })})`,
    `[$(add)](${buildCommandLink(ADJUST_ALPHA_COMMAND, {
      ...basePayload,
      delta: 0.1,
    })})`,
  ].join(' ')
}

/**
 * Build a VS Code command URI that passes the color value as a single argument.
 *
 * @param command - Command identifier to invoke.
 * @param value - Color string to pass to the command.
 * @returns Encoded command URI for Markdown links.
 */
function buildCommandLink(command: string, payload: unknown): string {
  const args = encodeURIComponent(JSON.stringify([payload]))
  return `command:${command}?${args}`
}

/**
 * Find the smallest color match that contains an offset.
 *
 * @param matches - Candidate color matches.
 * @param offset - Document offset to test.
 * @returns The innermost matching color range, if one exists.
 */
function findMatchAtOffset(
  matches: readonly ColorMatch[],
  offset: number,
): ColorMatch | undefined {
  return matches
    .filter(match => offset >= match.start && offset < match.end)
    .sort((a, b) => a.end - a.start - (b.end - b.start))[0]
}
