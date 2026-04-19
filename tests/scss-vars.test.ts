import { describe, expect, it } from 'vitest'
import { findScssVars } from '../src/strategies/scss-vars'
import { FIXTURE_SCSS } from './fixtures'

describe(findScssVars, () => {
  it('finds SCSS variable usages with named-color values', async () => {
    const text = `
      $named-red: red;
      .cls { color: $named-red; }
    `
    const result = await findScssVars(text)
    expect(
      result.some(match => text.slice(match.start, match.end) === '$named-red'),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('does not highlight a partial variable name inside a new definition name', async () => {
    const text = `
      $red: #ff0000;
      $red2: $red;
      .cls { color: $red2; border-color: $red; }
    `
    const result = await findScssVars(text)
    expect(result.some(match => match.start === text.indexOf('$red2'))).toBe(
      false,
    )
    expect(
      result.some(match => match.start === text.lastIndexOf('$red2')),
    ).toBe(true)
  })

  it('matches the expected playground SCSS variable usages without false property hits', async () => {
    const result = await findScssVars(FIXTURE_SCSS)
    const usages = result.map(match =>
      FIXTURE_SCSS.slice(match.start, match.end),
    )

    const expectedUsages = [
      '$hex-6',
      '$rgb-comma',
      '$hsl-comma',
      '$named-red',
      '$hex-8',
      '$hwb',
      '$oklch',
      '$hex-4',
      '$root-red',
      '$root-red-2',
      '$root-panel',
      '$local-border',
      '$local-bg',
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
    const missingUsages = expectedUsages.filter(
      usage => !actualUniqueUsages.includes(usage),
    )
    const falsePropertyHits = usages.filter(usage =>
      ['color', 'background', 'border-color', 'outline-color'].includes(usage),
    )

    expect(expectedUsages).toHaveLength(19)
    expect(actualUniqueUsages).toEqual(expect.arrayContaining(expectedUsages))
    expect(missingUsages).toEqual([])
    expect(falsePropertyHits).toEqual([])
  })
})
