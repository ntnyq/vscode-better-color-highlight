import { describe, expect, it } from 'vitest'
import {
  formatColorForSource,
  formatColorForSourceWithAlphaDelta,
  isArgbSourceKind,
  resolveColorSourceKind,
} from '../src/engine/presentation/source-color'

describe('source color presentation', () => {
  it('formats Android XML colors in alpha-first byte order', () => {
    expect(
      formatColorForSource(
        { a: 0.5, b: 0, g: 0, r: 255 },
        '#80FF0000',
        'android-xml-hex',
      ),
    ).toBe('#80FF0000')

    expect(
      formatColorForSource(
        { a: 1, b: 187, g: 170, r: 153 },
        '#abc',
        'android-xml-hex',
      ),
    ).toBe('#99aabb')
  })

  it('formats Compose packed colors without replacing the constructor syntax', () => {
    expect(
      formatColorForSource(
        { a: 0.5, b: 0, g: 0, r: 255 },
        'Color(0xFFFF0000)',
        'compose-argb-hex',
      ),
    ).toBe('Color(0x80FF0000)')
  })

  it('delegates Dart constructors through the same presentation seam', () => {
    expect(
      formatColorForSource(
        { a: 0.5, b: 0, g: 0, r: 255 },
        'Color.fromARGB(255, 255, 0, 0)',
        'dart',
      ),
    ).toBe('Color.fromARGB(128, 255, 0, 0)')
  })

  it('adjusts alpha while preserving source-specific syntax', () => {
    expect(
      formatColorForSourceWithAlphaDelta(-0.25, '#80ff0000', 'android-xml-hex'),
    ).toBe('#40ff0000')
    expect(
      formatColorForSourceWithAlphaDelta(
        -0.25,
        'Color(0x80FF0000)',
        'compose-argb-hex',
      ),
    ).toBe('Color(0x40FF0000)')
  })

  it('resolves source syntax only from precise language and file contexts', () => {
    expect(
      resolveColorSourceKind({
        filePath: 'file:///app/src/main/res/values/colors.xml',
        languageId: 'xml',
        sourceText: '#80ff0000',
      }),
    ).toBe('android-xml-hex')
    expect(
      resolveColorSourceKind({
        filePath: 'file:///workspace/example.xml',
        languageId: 'xml',
        sourceText: '#80ff0000',
      }),
    ).toBeUndefined()
    expect(
      resolveColorSourceKind({
        languageId: 'kotlin',
        sourceText: 'Color(0x80ff0000)',
      }),
    ).toBe('compose-argb-hex')
    expect(
      resolveColorSourceKind({
        languageId: 'dart',
        sourceText: 'Color(0x80ff0000)',
      }),
    ).toBe('dart')
  })

  it('identifies source kinds with alpha-first byte order', () => {
    expect(isArgbSourceKind('android-xml-hex')).toBe(true)
    expect(isArgbSourceKind('compose-argb-hex')).toBe(true)
    expect(isArgbSourceKind('dart')).toBe(true)
    expect(isArgbSourceKind()).toBe(false)
  })
})
