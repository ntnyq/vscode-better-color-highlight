import type { ColorPresentations, RgbaColor } from '../utils/color/presentation'

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

export interface DeterminateColorContrast {
  readonly aaaLargeText: boolean
  readonly aaaNormalText: boolean
  readonly aaLargeText: boolean
  readonly aaNormalText: boolean
  readonly effectiveForeground: RgbaColor
  readonly kind: 'determinate'
  readonly ratio: number
}

export type ColorContrastEvaluation =
  | DeterminateColorContrast
  | {
      readonly kind: 'indeterminate'
      readonly reason: 'translucent-background'
    }
