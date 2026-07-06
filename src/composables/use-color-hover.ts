import { onDeactivate } from 'reactive-vscode'
import { Hover, languages, MarkdownString, Range } from 'vscode'
import { config } from '../config'
import { getStrategies } from '../core/strategy-registry'
import { buildColorHoverMarkdown, getColorHover } from '../hover/color-hover'

/**
 * Register optional hover details for detected colors.
 */
export function useColorHover() {
  const disposable = languages.registerHoverProvider('*', {
    async provideHover(document, position) {
      const text = document.getText()
      const offset = document.offsetAt(position)
      const hover = await getColorHover({
        config,
        detectors: getStrategies(document.languageId, config),
        filePath: document.uri.toString(),
        languageId: document.languageId,
        offset,
        text,
      })

      if (!hover) return

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
