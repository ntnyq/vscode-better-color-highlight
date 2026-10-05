import { describe, expect, it } from 'vitest'
import {
  findUnityColors,
  parseUnityColor,
} from '../../../src/engine/strategies/unity-colors'

describe('unity static colors', () => {
  it.each([
    ['new UnityEngine.Color(1, 0, 0)', 'rgb(255, 0, 0)'],
    ['new UnityEngine.Color(1f, .5F, 0f, 0.5f)', 'rgba(255, 128, 0, 0.5)'],
    ['new UnityEngine.Color(+1e0F, -0f, 0.0_0f)', 'rgb(255, 0, 0)'],
    ['new UnityEngine.Color(1, 5E-1f, 1e-1F)', 'rgb(255, 128, 26)'],
    ['new UnityEngine.Color(b: 0, r: 1, g: 0)', 'rgb(255, 0, 0)'],
    ['new UnityEngine.Color(a: .5f, b: 0, r: 1, g: 0)', 'rgba(255, 0, 0, 0.5)'],
    ['new UnityEngine.Color(r: 1, 0, b: 0)', 'rgb(255, 0, 0)'],
    ['new UnityEngine.Color(1, g: 0, 0, a: 1)', 'rgb(255, 0, 0)'],
    ['new UnityEngine.Color(1, b: 0, g: 0)', 'rgb(255, 0, 0)'],
    ['new global::UnityEngine.Color(1, 0, 0)', 'rgb(255, 0, 0)'],
    ['new UnityEngine.Color32(255, 0, 0, 128)', 'rgba(255, 0, 0, 0.502)'],
    ['new UnityEngine.Color32(2_55, +0, -0, 2__55)', 'rgb(255, 0, 0)'],
    ['new UnityEngine.Color32(a: 255, b: 0, g: 0, r: 255)', 'rgb(255, 0, 0)'],
    ['new global::UnityEngine.Color32(255, 0, 0, 255)', 'rgb(255, 0, 0)'],
    ['new\nUnityEngine.Color (1, /* comma, ) */ 0, 0)', 'rgb(255, 0, 0)'],
    ['new UnityEngine.Color(1, // comma, )\n0, 0)', 'rgb(255, 0, 0)'],
  ])('resolves %s', (source, color) => {
    expect(findUnityColors(source, { languageId: 'csharp' })).toStrictEqual([
      {
        start: 0,
        end: source.length,
        color,
        editMode: 'source',
        sourceKind: 'unity-color',
      },
    ])
  })

  it.each([
    'new Color(1, 0, 0)',
    'using UnityEngine; new Color(1, 0, 0)',
    'using Color = UnityEngine.Color; new Color(1, 0, 0)',
    'new Custom.Color(1, 0, 0)',
    'UnityEngine.Color(1, 0, 0)',
    'new unityengine.Color(1, 0, 0)',
    'new UnityEngine.color(1, 0, 0)',
    'new UnityEngine.Color()',
    'new UnityEngine.Color(1, 0)',
    'new UnityEngine.Color(1, 0, 0, 1, 0)',
    'new UnityEngine.Color(1, 0, 0,)',
    'new UnityEngine.Color(1, 0, 0, /* trailing */)',
    'new UnityEngine.Color(1, 0,, 0)',
    'new UnityEngine.Color(1, 0, 0',
    'new UnityEngine.Color(1, 0, 0 // closing )',
    'new UnityEngine.Color(1, 0, 0 /* closing )',
    'new UnityEngine.Color(1, 0, .5)',
    'new UnityEngine.Color(1, 0, 1e-1)',
    'new UnityEngine.Color(1, 0, 0.5d)',
    'new UnityEngine.Color(1, 0, 0.5m)',
    'new UnityEngine.Color(1, 0, 1.f)',
    'new UnityEngine.Color(1, 0, 1_f)',
    'new UnityEngine.Color(1, 0, 0._5f)',
    'new UnityEngine.Color(1, 0, 5e-_1f)',
    'new UnityEngine.Color(1, 0, 1e999f)',
    'new UnityEngine.Color(1, 0, NaN)',
    'new UnityEngine.Color(2f, 0f, 0f)',
    'new UnityEngine.Color(-.1f, 0f, 0f)',
    'new UnityEngine.Color(1, 0, 0, 1.1f)',
    'new UnityEngine.Color(1, 0, channel)',
    'new UnityEngine.Color(1, 0, 1f / 2f)',
    'new UnityEngine.Color(1, 0, (float)0.5)',
    'new UnityEngine.Color(1, 0, GetChannel())',
    'new UnityEngine.Color(r: 1, r: 0, b: 0)',
    'new UnityEngine.Color(red: 1, g: 0, b: 0)',
    'new UnityEngine.Color(R: 1, g: 0, b: 0)',
    'new UnityEngine.Color(r = 1, g = 0, b = 0)',
    'new UnityEngine.Color(r: 1, g: 0, a: 1)',
    'new UnityEngine.Color(g: 0, 1, b: 0)',
    'new UnityEngine.Color(b: 0, g: 0, 1)',
    'new UnityEngine.Color32(255, 0, 0)',
    'new UnityEngine.Color32(255, 0, 0, 256)',
    'new UnityEngine.Color32(255, 0, 0, -1)',
    'new UnityEngine.Color32(255, 0, 0, 0.5f)',
    'new UnityEngine.Color32(255, 0, 0, 1f)',
    'new UnityEngine.Color32(255, 0, 0, 255.0)',
    'new UnityEngine.Color32(255, 0, 0, 255u)',
    'new UnityEngine.Color32(255, 0, 0, 255,)',
    'anew UnityEngine.Color(1, 0, 0)',
    '@new UnityEngine.Color(1, 0, 0)',
    'énew UnityEngine.Color(1, 0, 0)',
    '𐐀new UnityEngine.Color(1, 0, 0)',
    'thing.new UnityEngine.Color(1, 0, 0)',
  ])('rejects %s', source => {
    expect(findUnityColors(source)).toStrictEqual([])
    expect(parseUnityColor(source)).toBeNull()
  })

  it('scopes detection to C#', () => {
    expect(
      findUnityColors('new UnityEngine.Color(1, 0, 0)', {
        languageId: 'typescript',
      }),
    ).toStrictEqual([])
  })

  it('keeps full constructor UTF-16 spans in comments and strings', () => {
    const first = 'new UnityEngine.Color(1, 0, 0)'
    const second = 'new global::UnityEngine.Color32(0, 255, 0, 255)'
    const text = `// 🎨 ${first}\nvar example = "${second}";`
    expect(
      findUnityColors(text).map(({ start, end }) => [start, end]),
    ).toStrictEqual([
      [text.indexOf(first), text.indexOf(first) + first.length],
      [text.indexOf(second), text.indexOf(second) + second.length],
    ])
  })

  it('bounds scanning and resumes after an unfinished call', () => {
    const oversized = `new UnityEngine.Color(1, ${' '.repeat(4096)}0, 0)`
    const valid = 'new UnityEngine.Color(0, 1, 0)'
    expect(findUnityColors(oversized)).toStrictEqual([])
    const text = `new UnityEngine.Color(\n${valid}`
    expect(findUnityColors(text)).toMatchObject([
      { start: text.indexOf(valid) },
    ])
  })

  it('recovers valid inner and later constructors after unsupported nested calls', () => {
    const valid = 'new UnityEngine.Color(0, 1, 0)'
    const text = `new UnityEngine.Color(GetChannel(${valid}), 0, 0);\n${valid}`
    expect(
      findUnityColors(text).map(({ start, end }) => [start, end]),
    ).toStrictEqual([
      [text.indexOf(valid), text.indexOf(valid) + valid.length],
      [text.lastIndexOf(valid), text.length],
    ])
  })

  it('recovers after many unfinished constructors', () => {
    const valid = 'new UnityEngine.Color32(0, 255, 0, 255)'
    const malformed = 'new UnityEngine.Color('.repeat(10_000)
    expect(findUnityColors(malformed)).toStrictEqual([])
    expect(findUnityColors(malformed + valid)).toMatchObject([
      { start: malformed.length, end: malformed.length + valid.length },
    ])
  })

  it('keeps parentheses inside argument comments when scanning flat calls', () => {
    const source = 'new UnityEngine.Color(1, /* GetChannel( */ 0, // (\n0)'
    expect(findUnityColors(source)).toMatchObject([
      { start: 0, end: source.length, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('preserves names, comments, whitespace, and suffixes while editing', () => {
    const source =
      'new global::UnityEngine.Color (\n b: 0F, /* blue */ r : 1f,\n g: 0, a: 1F\n)'
    expect(
      parseUnityColor(source)?.format({ r: 0, g: 127.5, b: 255, a: 0.5 }),
    ).toBe(
      'new global::UnityEngine.Color (\n b: 1F, /* blue */ r : 0f,\n g: 0.5f, a: 0.5F\n)',
    )
  })

  it('adds valid float alpha before an existing line comment', () => {
    const source = 'new UnityEngine.Color(1, 0, 0 // blue\n)'
    const parsed = parseUnityColor(source)
    expect(parsed?.format({ ...parsed.color, a: 0.75 })).toBe(
      'new UnityEngine.Color(1, 0, 0, 0.75f // blue\n)',
    )
  })

  it('appends named alpha after reordered RGB arguments', () => {
    const source = 'new UnityEngine.Color(b: 0, r: 1, g: 0)'
    const parsed = parseUnityColor(source)
    expect(parsed?.format({ ...parsed.color, a: 0.5 })).toBe(
      'new UnityEngine.Color(b: 0, r: 1, g: 0, a: 0.5f)',
    )
  })

  it('retains high precision RGB literal spelling during alpha-only edits', () => {
    const source = 'new UnityEngine.Color(+0.123456789F, 5e-1f, 0.0_0f, 1)'
    const parsed = parseUnityColor(source)
    expect(parsed?.format({ ...parsed.color, a: 0.5 })).toBe(
      'new UnityEngine.Color(+0.123456789F, 5e-1f, 0.0_0f, 0.5f)',
    )
  })

  it('inherits the existing float suffix when inserting alpha', () => {
    const source = 'new global::UnityEngine.Color(b: 0F, r: 1F, g: 0F)'
    const parsed = parseUnityColor(source)
    expect(parsed?.format({ ...parsed.color, a: 0.5 })).toBe(
      'new global::UnityEngine.Color(b: 0F, r: 1F, g: 0F, a: 0.5F)',
    )
  })

  it.each([
    'new UnityEngine.Color(1, 0, 0)',
    'new UnityEngine.Color(1F, 0F, 0F, 1F)',
    'new UnityEngine.Color(b: 0, r: 1, g: 0)',
    'new global::UnityEngine.Color(1, g: 0, 0, a: 1)',
    'new UnityEngine.Color32(255, 0, 0, 255)',
    'new UnityEngine.Color32(a: 255, b: 0, g: 0, r: 255)',
  ])('round-trips picker edits for %s', source => {
    const replacement =
      parseUnityColor(source)?.format({
        r: 64,
        g: 128,
        b: 192,
        a: 128 / 255,
      }) ?? ''
    const roundTrip = parseUnityColor(replacement)?.color
    expect(roundTrip?.r).toBeCloseTo(64, 2)
    expect(roundTrip?.g).toBeCloseTo(128, 2)
    expect(roundTrip?.b).toBeCloseTo(192, 2)
    expect(roundTrip?.a).toBeCloseTo(128 / 255, 5)
  })

  it('rounds byte channels and retains unchanged integer spelling', () => {
    const source = 'new UnityEngine.Color32(+255, 0_0, 0, 255)'
    const parsed = parseUnityColor(source)
    expect(parsed?.format({ ...parsed.color, a: 0.5 })).toBe(
      'new UnityEngine.Color32(+255, 0_0, 0, 128)',
    )
  })
})
