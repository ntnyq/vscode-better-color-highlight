import { isString } from '@ntnyq/utils'
import { window } from 'vscode'
import { getHighlightState } from '../core/highlight-state'

/**
 * Read the latest highlight state for a supplied URI or the active editor.
 *
 * @param value - Optional document URI string.
 * @returns Latest highlight state for the document, if available.
 */
export function getDocumentHighlightState(value: unknown) {
  if (isString(value)) {
    return getHighlightState(value)
  }

  const uri = window.activeTextEditor?.document.uri.toString()
  return uri ? getHighlightState(uri) : undefined
}
