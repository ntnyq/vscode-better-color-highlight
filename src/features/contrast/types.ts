import type { RgbaColor } from '../../shared/color/presentation'

export interface ContrastRange {
  readonly end: number
  readonly start: number
}

export interface ResolvedContrastColor {
  readonly color: string
  readonly originalText: string
  readonly range: ContrastRange
}

export interface ResolvedContrastPair {
  readonly background: ResolvedContrastColor
  readonly contextKey: string
  readonly foreground: ResolvedContrastColor
  readonly variantKey: string
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
