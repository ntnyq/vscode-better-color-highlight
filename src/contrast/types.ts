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
