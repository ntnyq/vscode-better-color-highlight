import { onDeactivate, ref } from 'reactive-vscode'
import type { Ref } from 'reactive-vscode'
import { Hover, languages, MarkdownString, Range, workspace } from 'vscode'
import { config } from '../config'
import { getStrategies, shouldProcessLanguage } from '../core/strategy-registry'
import {
  buildColorHoverMarkdown,
  getColorHover,
  type ColorHoverMatchCache,
} from '../hover/color-hover'
import { logger } from '../utils/logger'

/**
 * Register optional hover details for detected colors.
 */
export function useColorHover(
  dependencyRevision: Readonly<Ref<number>> = ref(0),
) {
  const matchCache: ColorHoverMatchCache = new Map()
  const disposable = languages.registerHoverProvider('*', {
    async provideHover(document, position, cancellationToken) {
      if (!config.enable || !config.enableHover) {
        return
      }

      if (!shouldProcessLanguage(document.languageId, config.languages)) {
        return
      }

      if (cancellationToken.isCancellationRequested) {
        return
      }

      const text = document.getText()
      const offset = document.offsetAt(position)
      const matchCacheKey = createHoverMatchCacheKey(
        document.uri.toString(),
        document.version,
        document.languageId,
        dependencyRevision.value,
        workspace.isTrusted,
      )
      if (!matchCache.has(matchCacheKey) && matchCache.size >= 32) {
        const oldestKey = matchCache.keys().next().value
        if (oldestKey) {
          matchCache.delete(oldestKey)
        }
      }
      const hover = await getColorHover({
        cancellationToken,
        config,
        detectors: getStrategies(document.languageId, config),
        filePath: document.uri.toString(),
        languageId: document.languageId,
        matchCache,
        matchCacheKey,
        onDetectorError: message => logger.error(message),
        offset,
        text,
        workspaceIsTrusted: workspace.isTrusted,
      })

      if (!hover) {
        return
      }

      const markdown = new MarkdownString(buildColorHoverMarkdown(hover), true)
      markdown.isTrusted = true

      return new Hover(
        markdown,
        new Range(
          document.positionAt(hover.range.start),
          document.positionAt(hover.range.end),
        ),
      )
    },
  })

  onDeactivate(() => {
    matchCache.clear()
    disposable.dispose()
  })
}

/**
 * Create a stable key for reusable hover detector results.
 *
 * @param uri - Document URI string
 * @param documentVersion - VS Code text-document version
 * @param languageId - VS Code document language identifier
 * @param dependencyRevision - Cross-file stylesheet dependency revision
 * @param workspaceIsTrusted - Whether cross-file reads are currently allowed
 * @returns Serialized hover cache key
 */
function createHoverMatchCacheKey(
  uri: string,
  documentVersion: number,
  languageId: string,
  dependencyRevision: number,
  workspaceIsTrusted: boolean,
): string {
  return JSON.stringify({
    uri,
    documentVersion,
    languageId,
    dependencyRevision,
    workspaceIsTrusted,
    matchWords: config.matchWords,
    namedColorMatchMode: config.namedColorMatchMode,
    resolveScssVariablesAcrossFiles: config.resolveScssVariablesAcrossFiles,
    scssLoadPaths: config.scssLoadPaths,
    resolveCssVariablesAcrossFiles: config.resolveCssVariablesAcrossFiles,
    cssVariablePaths: config.cssVariablePaths,
    cssVariableTrustedSelectors: config.cssVariableTrustedSelectors,
    designTokenJsonMode: config.designTokenJsonMode,
    resolveDesignTokensAcrossFiles: config.resolveDesignTokensAcrossFiles,
    useARGB: config.useARGB,
    matchRgbWithNoFunction: config.matchRgbWithNoFunction,
    rgbWithNoFunctionLanguages: config.rgbWithNoFunctionLanguages,
    matchHslWithNoFunction: config.matchHslWithNoFunction,
    hslWithNoFunctionLanguages: config.hslWithNoFunctionLanguages,
  })
}
