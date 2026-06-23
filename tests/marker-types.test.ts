import { describe, expect, it } from 'vitest'
import { buildDecorationOptions } from '../src/decorations/marker-types'

describe(buildDecorationOptions, () => {
  it('renders transparent background markers with an opaque display color', () => {
    const result = buildDecorationOptions(
      'background',
      'rgba(255, 0, 0, 0)',
      true,
    )

    expect(result.backgroundColor).toBe('rgb(255, 0, 0)')
    expect(result.border).toBe('3px solid rgb(255, 0, 0)')
    expect(result.overviewRulerColor).toBe('rgb(255, 0, 0)')
  })

  it('renders transparent foreground markers with an opaque display color', () => {
    const result = buildDecorationOptions(
      'foreground',
      'rgba(0, 128, 255, 0.1)',
      true,
    )

    expect(result.color).toBe('rgb(0, 128, 255)')
    expect(result.overviewRulerColor).toBe('rgb(0, 128, 255)')
  })

  it('renders transparent dot markers with an opaque display color', () => {
    const result = buildDecorationOptions(
      'dot-before',
      'rgba(57, 197, 187, 0.502)',
      true,
    )

    expect(result.before?.backgroundColor).toBe('rgb(57, 197, 187)')
    expect(result.overviewRulerColor).toBe('rgb(57, 197, 187)')
  })
})
