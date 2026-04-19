import { describe, expect, it } from 'vitest'
import { findStylusVars } from '../src/strategies/stylus-vars'

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
})
