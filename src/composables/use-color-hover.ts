import { onDeactivate } from 'reactive-vscode'
import { Hover, languages, MarkdownString, Range, workspace } from 'vscode'
import { config } from '../config'
import { getStrategies, shouldProcessLanguage } from '../core/strategy-registry'
import { buildColorHoverMarkdown, getColorHover } from '../hover/color-hover'
import { logger } from '../utils/logger'

/**
 * Register optional hover details for detected colors.
 */
export function useColorHover() {
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
      const hover = await getColorHover({
        cancellationToken,
        config,
        detectors: getStrategies(document.languageId, config),
        filePath: document.uri.toString(),
        languageId: document.languageId,
        onDetectorError: message => logger.error(message),
        offset,
        text,
        workspaceIsTrusted: workspace.isTrusted,
      })

      if (!hover) {
        return
      }

      const markdown = new MarkdownString(
        buildColorHoverMarkdown(hover.presentations),
        true,
      )
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
    disposable.dispose()
  })
}
