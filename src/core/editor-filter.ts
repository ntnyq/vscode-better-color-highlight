import type { TextDocument, TextEditor } from 'vscode'

const EXCLUDED_SCHEME_KEYWORDS = ['output', 'debug', 'terminal'] as const

/**
 * Exclude VS Code panel-backed documents that should not be color-highlighted.
 * This prevents feedback loops when the extension logs to the Output panel.
 */
export function shouldTrackDocument(
  document: Pick<TextDocument, 'uri'>,
): boolean {
  const scheme = document.uri.scheme.toLowerCase()
  return !EXCLUDED_SCHEME_KEYWORDS.some(keyword => scheme.includes(keyword))
}

/**
 * Check whether a visible editor should be tracked for decorations.
 */
export function shouldTrackEditor(
  editor: Pick<TextEditor, 'document'>,
): boolean {
  return shouldTrackDocument(editor.document)
}
