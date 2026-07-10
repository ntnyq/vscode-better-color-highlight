import { describe, expect, it } from 'vitest'
import { findStylusVars } from '../src/strategies/stylus-vars'
import { FIXTURE_STYLUS } from './fixtures'

describe(findStylusVars, () => {
  it('finds Stylus variable usages in property values', async () => {
    const text = `
      named-red = #ff0000
      .cls
        color named-red
    `
    const result = await findStylusVars(text)
    expect(
      result.some(match => text.slice(match.start, match.end) === 'named-red'),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('finds Stylus variable usages with $var-name syntax', async () => {
    const text = `
      $named-red = #ff0000
      .cls
        color $named-red
    `
    const result = await findStylusVars(text)
    expect(
      result.some(match => text.slice(match.start, match.end) === '$named-red'),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('finds Stylus $var-name usages when the variable is defined with colon syntax', async () => {
    const text = `
      $named-red: #ff0000
      .cls
        color: $named-red
    `
    const result = await findStylusVars(text)
    expect(
      result.some(match => text.slice(match.start, match.end) === '$named-red'),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('resolves nested Stylus variable references', async () => {
    const text = `
      base-red = #ff0000
      named-red = base-red
      .cls
        color named-red
    `
    const result = await findStylusVars(text)
    expect(
      result.some(match => match.start === text.lastIndexOf('named-red')),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('keeps detector output on usages when the last definition wins', async () => {
    const text = 'brand = #111111\nbrand = #222222\na\n  color brand'
    const result = await findStylusVars(text)

    expect(result).toStrictEqual([
      {
        start: text.lastIndexOf('brand'),
        end: text.lastIndexOf('brand') + 5,
        color: 'rgb(34, 34, 34)',
      },
    ])
  })

  it('does not partially highlight a variable name inside a longer Stylus definition', async () => {
    const text = `
      red = #ff0000
      red2 = red
      .cls
        color red2
        border-color red
    `
    const result = await findStylusVars(text)
    expect(result.some(match => match.start === text.indexOf('red2'))).toBe(
      false,
    )
    expect(result.some(match => match.start === text.lastIndexOf('red2'))).toBe(
      true,
    )
  })

  it('skips Stylus variable values that are composite expressions', async () => {
    const text = `
      $red = #ff0000
      $border-token = 1px solid red
      $mixed-token = color-mix(in srgb, $red, white)
      .cls
        border $border-token
        color $mixed-token
    `
    const result = await findStylusVars(text)
    const usages = result.map(match => text.slice(match.start, match.end))

    expect(usages).not.toStrictEqual(
      expect.arrayContaining(['$border-token', '$mixed-token']),
    )
  })

  it('resolves complex stylus variable usages across scopes and nested references', async () => {
    const text = `
      $root-red = #ff0000
      $root-red-2 = $root-red
      $root-panel = rgb(30, 64, 175)

      .root-scope-usage
        color $root-red
        background $root-red-2
        border-color $root-panel

      .local-scope
        $local-accent = #7c3aed
        $local-fill: hsl(160, 70%, 45%)
        color $local-accent
        background $local-fill

      $base-brand = #0ea5e9
      $brand-strong = $base-brand
      $brand-ring: $brand-strong
      $token-rgb = 255 0 0
      $token-hsl: 0 100% 50%

      .nested-usage
        color $brand-strong
        outline-color: $brand-ring
        background $token-rgb
        box-shadow 0 0 0 2px $token-hsl

      $red = #ff0000
      $red2 = $red
      $red-long: $red2

      .partial-name-safe
        color $red2
        border-color $red-long
        box-shadow 0 0 0 2px $red
    `
    const result = await findStylusVars(text)
    const usages = result.map(match => text.slice(match.start, match.end))

    expect(usages).toStrictEqual(
      expect.arrayContaining([
        '$root-red',
        '$root-red-2',
        '$root-panel',
        '$local-accent',
        '$local-fill',
        '$brand-strong',
        '$brand-ring',
        '$token-rgb',
        '$token-hsl',
        '$red2',
        '$red-long',
        '$red',
      ]),
    )

    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
    expect(result.some(match => match.color === 'rgb(30, 64, 175)')).toBe(true)
    expect(result.some(match => match.color === 'rgb(124, 58, 237)')).toBe(true)
    expect(
      result.some(
        match =>
          text.slice(match.start, match.end) === '$token-rgb' &&
          match.color === 'rgb(255, 0, 0)',
      ),
    ).toBe(true)
    expect(
      result.some(
        match =>
          text.slice(match.start, match.end) === '$token-hsl' &&
          match.color === 'rgb(255, 0, 0)',
      ),
    ).toBe(true)
    expect(usages).not.toStrictEqual(
      expect.arrayContaining(['color', 'background', 'border-color']),
    )
  })

  it('matches the expected class usages in playground stylus without false property hits', async () => {
    const result = await findStylusVars(FIXTURE_STYLUS)
    const usages = result.map(match =>
      FIXTURE_STYLUS.slice(match.start, match.end),
    )

    const expectedClassUsages = [
      '$hex-6',
      '$rgb-comma',
      '$hsl-comma',
      '$named-red',
      '$hex-8',
      '$hwb',
      '$root-red',
      '$root-red-2',
      '$root-panel',
      '$colon-red',
      '$colon-red-2',
      '$local-accent',
      '$local-fill',
      '$brand-strong',
      '$brand-ring',
      '$red2',
      '$red-long',
      '$red',
      '$display-p3-accent',
      '$rec2020-accent',
      '$prophoto-accent',
    ]

    const actualUniqueUsages = [
      ...new Set(usages.filter(usageText => usageText.startsWith('$'))),
    ]
    const missingUsages = expectedClassUsages.filter(
      usage => !actualUniqueUsages.includes(usage),
    )
    const falsePropertyHits = usages.filter(usage =>
      ['color', 'background', 'border-color', 'outline-color'].includes(usage),
    )

    expect(expectedClassUsages).toHaveLength(21)
    expect(actualUniqueUsages).toStrictEqual(
      expect.arrayContaining(expectedClassUsages),
    )
    expect(missingUsages).toStrictEqual([])
    expect(falsePropertyHits).toStrictEqual([])
  })
})
