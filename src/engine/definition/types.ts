export interface ColorSourceRange {
  readonly start: number
  readonly end: number
}

export interface ColorDefinitionTarget {
  readonly originRange: ColorSourceRange
  readonly targetFilePath: string
  readonly targetRange: ColorSourceRange
  readonly targetSelectionRange: ColorSourceRange
  /**
   * Optional source snapshot to validate after opening an asynchronous target.
   */
  readonly targetText?: string
}
