/** Source range for one design token expression. */
export interface DesignTokenRange {
  readonly start: number
  readonly end: number
}

/** One parsed design token with semantic and source metadata. */
export interface DesignTokenEntry {
  readonly definitionRange?: DesignTokenRange
  readonly path: readonly string[]
  readonly range: DesignTokenRange
  readonly reference?: string
  readonly type?: string
  readonly value?: unknown
}

/** Syntax-independent parsed design token document. */
export interface ParsedDesignTokenDocument {
  readonly root: unknown
  readonly tokens: readonly DesignTokenEntry[]
}

/** Component accepted by the DTCG color format. */
export type DtcgColorComponent = number | 'none'

/** Structured DTCG color value. */
export interface DtcgColorValue {
  readonly alpha?: number
  readonly colorSpace: string
  readonly components: readonly DtcgColorComponent[]
  readonly hex?: string
}
