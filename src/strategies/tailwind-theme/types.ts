/** Tailwind palette compatibility mode. */
export type TailwindColorMode = 'auto' | 'v3' | 'v4'

/** Half-open source range. */
export interface TailwindSourceRange {
  readonly end: number
  readonly start: number
}

/** A value and its exact location in a Tailwind theme source. */
export interface TailwindRangedValue {
  readonly filePath?: string
  readonly range: TailwindSourceRange
  readonly value: string
  readonly valueRange: TailwindSourceRange
}

/** One resolved theme color with optional source information. */
export interface TailwindThemeColor {
  readonly source?: TailwindRangedValue
  readonly value: string
}

/** The palette and compatibility metadata shared by Tailwind consumers. */
export interface TailwindColorTheme {
  readonly colors: ReadonlyMap<string, TailwindThemeColor>
  readonly hasColorNamespaceReset: boolean
  readonly hasV4Signal: boolean
  readonly mode: TailwindColorMode
}

/** Palette-selection context accepted by the synchronous base detector. */
export interface TailwindColorContext {
  readonly hasV4Signal?: boolean
  readonly languageId?: string
  readonly mode?: TailwindColorMode
}
