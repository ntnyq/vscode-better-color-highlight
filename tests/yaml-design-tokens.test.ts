import { describe, expect, it } from 'vitest'
import { findYamlDesignTokens } from '../src/strategies/yaml-design-tokens'

describe(findYamlDesignTokens, () => {
  it('finds DTCG group root tokens', () => {
    const text = `brand:\n  $type: color\n  $root:\n    $value: { colorSpace: srgb, components: [1, 0, 0] }\n`

    expect(findYamlDesignTokens(text)).toMatchObject([
      { color: 'rgb(255, 0, 0)' },
    ])
  })
  it('finds block and flow structured color values with precise ranges', () => {
    const text = `brand:
  $type: color
  $value:
    colorSpace: srgb
    components:
      - 1
      - 0
      - 0
accent:
  $type: color
  $value: { colorSpace: hsl, components: [120, 1, 0.5], alpha: 0.5 }
`

    const matches = findYamlDesignTokens(text)

    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({ color: 'rgb(255, 0, 0)' })
    expect(text.slice(matches[0].start, matches[0].end)).toBe(
      '- 1\n      - 0\n      - 0',
    )
    expect(matches[1]).toMatchObject({ color: 'rgba(0, 255, 0, 0.5)' })
    expect(text.slice(matches[1].start, matches[1].end)).toBe('[120, 1, 0.5]')
  })

  it('resolves inherited types and quoted aliases', () => {
    const text = `palette:
  $type: color
  base:
    $value:
      colorSpace: srgb
      components: [0, 0.5, 1]
  alias:
    $value: "{palette.base}"
`

    const matches = findYamlDesignTokens(text)

    expect(matches).toHaveLength(2)
    expect(matches.map(match => match.color)).toStrictEqual([
      'rgb(0, 128, 255)',
      'rgb(0, 128, 255)',
    ])
    expect(text.slice(matches[1].start, matches[1].end)).toBe('{palette.base}')
  })

  it('supports comments without including them in source ranges', () => {
    const text = `brand: # group comment
  $type: color
  $value:
    colorSpace: srgb
    components: [1, 0, 0] # value comment
`

    const [match] = findYamlDesignTokens(text)

    expect(match?.color).toBe('rgb(255, 0, 0)')
    expect(text.slice(match!.start, match!.end)).toBe('[1, 0, 0]')
  })

  it('returns no matches for malformed YAML', () => {
    expect(findYamlDesignTokens('token: [\n  invalid')).toStrictEqual([])
  })

  it.each(['.inf', '-.inf', '.nan'])(
    'rejects non-finite fallback components parsed from YAML: %s',
    component => {
      for (const colorSpace of ['lab', 'lch', 'oklab', 'oklch']) {
        const text = `brand:
  $type: color
  $value:
    colorSpace: ${colorSpace}
    components: [none, ${component}, 0]
    hex: '#00ff00'
`
        expect(findYamlDesignTokens(text)).toStrictEqual([])
      }
    },
  )

  it('does not scan arbitrary YAML strings for literal colors', () => {
    const text = `name: red
theme: "#ff0000"
items:
  - rgb(0, 255, 0)
`

    expect(findYamlDesignTokens(text)).toStrictEqual([])
  })

  it('resolves local JSON Pointer references', () => {
    const text = `base:
  $type: color
  $value:
    colorSpace: srgb
    components: [1, 0, 1]
alias:
  $type: color
  $ref: "#/base/$value"
`

    const matches = findYamlDesignTokens(text)

    expect(matches).toHaveLength(2)
    expect(matches[1]?.color).toBe('rgb(255, 0, 255)')
    expect(text.slice(matches[1].start, matches[1].end)).toBe('#/base/$value')
  })
})
