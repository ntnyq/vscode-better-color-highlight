/**
 * Observable summary for the latest color highlight run of one document.
 */
export interface HighlightState {
  /**
   * Number of unique resolved colors.
   */
  readonly colorCount: number

  /**
   * Unique resolved colors in the order they were decorated.
   */
  readonly colors: readonly string[]

  /**
   * VS Code language ID used for the run.
   */
  readonly languageId: string

  /**
   * Number of detected color matches.
   */
  readonly matchCount: number

  /**
   * Document URI string.
   */
  readonly uri: string
}

const highlightStates = new Map<string, HighlightState>()

/**
 * Store the latest highlight summary for a document.
 *
 * @param state - Highlight summary to store.
 */
export function setHighlightState(state: HighlightState) {
  highlightStates.set(state.uri, {
    ...state,
    colors: [...state.colors],
  })
}

/**
 * Read the latest highlight summary for a document.
 *
 * @param uri - Document URI string.
 * @returns Stored highlight summary, if the document has been processed.
 */
export function getHighlightState(uri: string): HighlightState | undefined {
  const state = highlightStates.get(uri)
  if (!state) {
    return undefined
  }

  return {
    ...state,
    colors: [...state.colors],
  }
}

/**
 * Remove the latest highlight summary for a document.
 *
 * @param uri - Document URI string.
 */
export function clearHighlightState(uri: string) {
  highlightStates.delete(uri)
}
