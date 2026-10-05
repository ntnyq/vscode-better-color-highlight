import { describe, expect, it } from 'vitest'
import {
  formatColorForSource,
  formatColorForSourceWithAlphaDelta,
  isColorSourceKind,
  isArgbSourceKind,
  resolveColorSourceKind,
} from '../../../src/engine/presentation/source-color'

describe('source color presentation', () => {
  it.each([
    'rgb(calc(64 + 64) max(16, 32) clamp(0, 64, 255) / min(.5, 1))',
    'hsl(min(.5turn, 200deg) max(50%, 100%) calc(25% + 25%))',
    'color(display-p3 calc(1 / 2) 0 0 / clamp(0, .5, 1))',
    'rgb(from red min(r, 128) max(g, 0) clamp(0, calc(b + 64), 255))',
    'alpha(from red / clamp(0, min(alpha, .5), 1))',
  ])(
    'keeps CSS math expressions eligible for generic edits: %s',
    sourceText => {
      expect(
        resolveColorSourceKind({ languageId: 'css', sourceText }),
      ).toBeUndefined()
    },
  )

  it('validates Unity command metadata and requires C# constructor syntax', () => {
    const sourceText = 'new UnityEngine.Color(1f, 0f, 0f)'
    expect(isColorSourceKind('unity-color')).toBe(true)
    expect(isArgbSourceKind('unity-color')).toBe(false)
    expect(resolveColorSourceKind({ languageId: 'csharp', sourceText })).toBe(
      'unity-color',
    )
    expect(
      resolveColorSourceKind({ languageId: 'typescript', sourceText }),
    ).toBeUndefined()
    expect(
      resolveColorSourceKind({
        languageId: 'csharp',
        sourceText: 'new Color(1f, 0f, 0f)',
      }),
    ).toBeUndefined()
  })

  it('adjusts Unity alpha from source precision while retaining RGB tokens', () => {
    expect(
      formatColorForSourceWithAlphaDelta(
        -0.1,
        'new UnityEngine.Color(0.123456789f, 0F, 1, 0.52345f)',
        'unity-color',
      ),
    ).toBe('new UnityEngine.Color(0.123456789f, 0F, 1, 0.42345f)')
    expect(
      formatColorForSourceWithAlphaDelta(
        0.1,
        'new UnityEngine.Color32(64, 128, 192, 128)',
        'unity-color',
      ),
    ).toBe('new UnityEngine.Color32(64, 128, 192, 154)')
  })

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
