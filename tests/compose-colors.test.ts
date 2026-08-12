import { describe, expect, it } from 'vitest'
import { findComposeArgbHexColors } from '../src/engine/strategies/compose-colors'
import { findHexRGBA } from '../src/engine/strategies/hex'

describe(findComposeArgbHexColors, () => {
  it('resolves a complete Compose packed ARGB constructor', () => {
    const text = 'val brand = Color(0x80FF0000)'

    expect(findComposeArgbHexColors(text)).toStrictEqual([
      {
        start: text.indexOf('Color('),
        end: text.length,
        color: 'rgba(255, 0, 0, 0.502)',
        editMode: 'source',
        sourceKind: 'compose-argb-hex',
      },
    ])
  })

  it('accepts Kotlin integer suffixes and rejects non-static arguments', () => {
    expect(findComposeArgbHexColors('Color(0xff336699UL)')).toHaveLength(1)
    expect(findComposeArgbHexColors('Color(brandColor)')).toStrictEqual([])
  })

  it('prevents the generic detector from interpreting the inner literal as RGBA', () => {
    expect(
      findHexRGBA('Color(0x80FF0000)', { languageId: 'kotlin' }),
    ).toStrictEqual([])
  })
})
