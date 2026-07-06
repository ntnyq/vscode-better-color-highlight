import { shouldProcessLanguage } from '../core/strategy-registry'
import type { NestedScopedConfigs } from '../meta'
import type { ColorDetector, ColorMatch, StrategyContext } from '../types'
import {
  getColorPresentations,
  type ColorPresentations,
} from '../utils/color/presentation'

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
 * Hover data for a detected color under the cursor.
 */
export interface ColorHover {
  /**
   * Copy-ready color representations shown in the hover.
   */
  readonly presentations: ColorPresentations

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
}

/**
 * Inputs required to resolve color hover content for a document offset.
 */
export interface ColorHoverOptions {
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
  readonly filePath?: string

  /**
   * VS Code language identifier for the document.
   */
  readonly languageId: string

  /**
   * Document offset where the hover was requested.
   */
  readonly offset: number

  /**
   * Full document text to scan.
   */
  readonly text: string
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
  const { config, detectors, filePath, languageId, offset, text } = options

  if (!config.enable || !config.enableHover) return null
  if (!shouldProcessLanguage(languageId, config.languages)) return null
  if (config.maxFileSize > 0 && text.length > config.maxFileSize) return null

  const context: StrategyContext = {
    languageId,
    filePath,
    namedColorMatchMode: config.namedColorMatchMode,
    resolveScssVariablesAcrossFiles: config.resolveScssVariablesAcrossFiles,
    scssLoadPaths: config.scssLoadPaths,
    resolveCssVariablesAcrossFiles: config.resolveCssVariablesAcrossFiles,
    cssVariablePaths: config.cssVariablePaths,
    cssVariableTrustedSelectors: config.cssVariableTrustedSelectors,
    designTokenJsonMode: config.designTokenJsonMode,
    useARGB: config.useARGB,
  }

  const results = await Promise.all(
    detectors.map(detector => detector(text, context)),
  )
  const match = findMatchAtOffset(results.flat(), offset)
  if (!match) return null

  const presentations = getColorPresentations(match.color)
  if (!presentations) return null

  return {
    presentations,
    range: {
      start: match.start,
      end: match.end,
    },
  }
}

/**
 * Build markdown shown in the VS Code color hover.
 *
 * @param presentations - Color strings to display and copy.
 * @returns Trusted markdown body with command links.
 */
export function buildColorHoverMarkdown(
  presentations: ColorPresentations,
): string {
  return [
    '**Color Highlight**',
    '',
    formatPresentationLine('HEX', presentations.hex, COPY_COMMANDS.hex),
    formatPresentationLine('RGB', presentations.rgb, COPY_COMMANDS.rgb),
    formatPresentationLine('HSL', presentations.hsl, COPY_COMMANDS.hsl),
    formatPresentationLine('OKLCH', presentations.oklch, COPY_COMMANDS.oklch),
    `Alpha: \`${presentations.alpha}\``,
  ].join('\n\n')
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
  value: string,
  command: string,
): string {
  return `${label}: \`${value}\` [Copy](${buildCommandLink(command, value)})`
}

/**
 * Build a VS Code command URI that passes the color value as a single argument.
 *
 * @param command - Command identifier to invoke.
 * @param value - Color string to pass to the command.
 * @returns Encoded command URI for Markdown links.
 */
function buildCommandLink(command: string, value: string): string {
  const args = encodeURIComponent(JSON.stringify([value]))
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
