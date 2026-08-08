import type { ColorPresentations } from '../../shared/color/presentation'

export interface ContrastColorSelection {
  readonly color: string
  readonly occurrence?: WorkspaceColorOccurrence
}

export interface ContrastCommandInput {
  readonly background?: ContrastColorSelection
  readonly foreground?: ContrastColorSelection
  readonly palette?: WorkspacePaletteResult
}

export interface WorkspaceColorOccurrence {
  readonly color: string
  readonly end: number
  readonly sourceText: string
  readonly start: number
  readonly uri: string
}

export interface WorkspaceColorGroup {
  readonly color: string
  readonly occurrences: readonly WorkspaceColorOccurrence[]
  readonly presentations: ColorPresentations
}

export interface WorkspacePaletteResult {
  readonly groups: readonly WorkspaceColorGroup[]
  readonly occurrenceTruncated: boolean
  readonly scannedFileCount: number
  readonly skippedFileCount: number
  readonly truncated: boolean
}
