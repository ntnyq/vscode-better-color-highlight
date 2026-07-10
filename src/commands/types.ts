import type { ColorPresentationFormat } from '../utils/color/presentation'

/**
 * Color presentation formats supported by copy and replacement commands.
 */
export type CopyColorFormat = ColorPresentationFormat

export interface OffsetRange {
  readonly end: number
  readonly start: number
}

export interface ReplaceColorPayload {
  readonly originalText: string
  readonly range: OffsetRange
  readonly uri: string
  readonly value: string
}

export interface AdjustColorAlphaPayload {
  readonly delta: number
  readonly originalColor: string
  readonly originalText: string
  readonly range: OffsetRange
  readonly uri: string
}
