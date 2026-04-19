import { describe, expect, it } from 'vitest'
import { findScssVars } from '../src/strategies/scss-vars'

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
})
