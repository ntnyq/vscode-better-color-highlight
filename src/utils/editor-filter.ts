import type { TextDocument, TextEditor } from 'vscode'
import { EXCLUDED_SCHEME_KEYWORDS } from '../constants'

/**
 * Exclude VS Code panel-backed documents that should not be color-highlighted.
 * This prevents feedback loops when the extension logs to the Output panel.
 *
 * @param document - The document-like object whose URI should be checked
 * @returns Whether the document should be tracked
 */
export function shouldTrackDocument(
  document: Pick<TextDocument, 'uri'>,
): boolean {
  const scheme = document.uri.scheme.toLowerCase()
  return !EXCLUDED_SCHEME_KEYWORDS.some(keyword => scheme.includes(keyword))
}

/**
 * Check whether a visible editor should be tracked for decorations.
 *
 * @param editor - The editor-like object whose document should be checked
 * @returns Whether the editor should be tracked
 */
export function shouldTrackEditor(
  editor: Pick<TextEditor, 'document'>,
): boolean {
  return shouldTrackDocument(editor.document)
}
