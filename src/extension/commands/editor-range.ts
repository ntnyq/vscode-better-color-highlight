import { Range as VscodeRange, window } from 'vscode'
import { isValidOffsetRange } from './offset-range'
import type { ReplaceColorPayload } from './types'

/**
 * Replace a range in the active editor only when it still contains the
 * original source text captured by the hover.
 *
 * @param payload - Range and original text from the hover command payload.
 * @param replacement - Text to insert.
 * @returns Whether VS Code accepted the edit.
 */
export async function replaceActiveEditorRange(
  payload: Pick<ReplaceColorPayload, 'originalText' | 'range' | 'uri'>,
  replacement: string,
): Promise<boolean> {
  const editor = window.activeTextEditor
  if (
    !editor ||
    editor.document.uri.toString() !== payload.uri ||
    !isValidOffsetRange(payload.range)
  ) {
    return false
  }

  const document = editor.document
  const range = new VscodeRange(
    document.positionAt(payload.range.start),
    document.positionAt(payload.range.end),
  )

  if (document.getText(range) !== payload.originalText) {
    return false
  }

  return await editor.edit(builder => {
    builder.replace(range, replacement)
  })
}
