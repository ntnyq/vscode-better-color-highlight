import {
  Color,
  ColorInformation,
  ColorPresentation,
  Range,
  TextEdit,
  workspace,
} from 'vscode'
import type { CancellationToken, TextDocument } from 'vscode'
import { config } from '../config'
import { runColorDetectors } from '../core/color-detection'
import { getStrategies, shouldProcessLanguage } from '../core/strategy-registry'
import type { ColorMatch, StrategyContext } from '../types'
import {
  formatColorPresentation,
  getColorPresentationsFromRgba,
  parseResolvedColor,
} from '../utils/color/presentation'
import type { ColorPresentationFormat } from '../utils/color/presentation'
import { logger } from '../utils/logger'

const PRESENTATION_FORMATS: readonly ColorPresentationFormat[] = [
  'hex',
  'rgb',
  'hsl',
  'oklch',
]

/**
 * Detect colors for VS Code's native document color provider.
 *
 * @param document - Document requested by VS Code
 * @param cancellationToken - Provider request cancellation token
 * @returns Native color information for supported matches
 */
export async function provideDocumentColors(
  document: TextDocument,
  cancellationToken: CancellationToken,
): Promise<ColorInformation[]> {
  if (
    !config.enable ||
    !config.enableColorPicker ||
    cancellationToken.isCancellationRequested ||
    !shouldProcessLanguage(document.languageId, config.languages)
  ) {
    return []
  }

  const text = document.getText()
  if (config.maxFileSize > 0 && text.length > config.maxFileSize) {
    return []
  }

  const context: StrategyContext = {
    languageId: document.languageId,
    filePath: document.uri.toString(),
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
    workspaceIsTrusted: workspace.isTrusted,
  }
  const matches = await runColorDetectors({
    context,
    detectors: getStrategies(document.languageId, config),
    onDetectorError: message => logger.error(message),
    text,
  })

  if (cancellationToken.isCancellationRequested) {
    return []
  }

  return createColorInformation(document, matches)
}

/**
 * Convert resolved detector matches to deduplicated native color information.
 *
 * @param document - Source document used for offset conversion
 * @param matches - Resolved detector matches
 * @returns Native color information with normalized channels
 */
export function createColorInformation(
  document: TextDocument,
  matches: readonly ColorMatch[],
): ColorInformation[] {
  const seen = new Set<string>()
  const result: ColorInformation[] = []

  for (const match of matches) {
    const key = `${match.start}:${match.end}:${match.color}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)

    const color = parseResolvedColor(match.color)
    if (!color) {
      continue
    }

    const start = document.positionAt(match.start)
    const end = document.positionAt(match.end)
    const range = new Range(start, end)
    const nativeColor = new Color(
      color.r / 255,
      color.g / 255,
      color.b / 255,
      color.a,
    )
    result.push(new ColorInformation(range, nativeColor))
  }

  return result
}

/**
 * Build native replacement presentations for a selected color.
 *
 * @param color - VS Code color with normalized channels
 * @param context - Document and source range selected by VS Code
 * @returns HEX, RGB, HSL, and OKLCH replacement presentations
 */
export function provideColorPresentations(
  color: Color,
  context: { readonly document: TextDocument; readonly range: Range },
): ColorPresentation[] {
  const presentations = getColorPresentationsFromRgba({
    r: normalizedChannelToByte(color.red),
    g: normalizedChannelToByte(color.green),
    b: normalizedChannelToByte(color.blue),
    a: clampNormalizedChannel(color.alpha),
  })

  return PRESENTATION_FORMATS.map(format => {
    const value = formatColorPresentation(presentations, format)
    const presentation = new ColorPresentation(value)
    presentation.textEdit = TextEdit.replace(context.range, value)
    return presentation
  })
}

/**
 * Convert a normalized channel to the nearest byte.
 *
 * @param value - Channel in the nominal 0-1 range
 * @returns Integer byte in the 0-255 range
 */
function normalizedChannelToByte(value: number): number {
  return Math.round(clampNormalizedChannel(value) * 255)
}

/**
 * Clamp a normalized color channel.
 *
 * @param value - Channel value
 * @returns Value in the inclusive 0-1 range
 */
function clampNormalizedChannel(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}
