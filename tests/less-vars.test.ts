import { describe, expect, it } from 'vitest'
import { findLessVars } from '../src/strategies/less-vars'

describe(findLessVars, () => {
  it('finds Less variable usages with named-color values', async () => {
    const text = `
      @named-red: red;
      .cls { color: @named-red; }
    `
    const result = await findLessVars(text)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
    expect(text.slice(result[0].start, result[0].end)).toBe('@named-red')
  })

  it('finds Less variable usages when the definition is inline in a rule block', async () => {
    const text = '.theme { @named-red: #ff0000; color: @named-red; }'
    const result = await findLessVars(text)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('resolves nested Less variable references', async () => {
    const text = `
      @base-red: #ff0000;
      @named-red: @base-red;
      .cls { color: @named-red; }
    `
    const result = await findLessVars(text)
    expect(
      result.some(match => text.slice(match.start, match.end) === '@named-red'),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('does not partially highlight a variable name inside a longer Less definition', async () => {
    const text = `
      @red: #ff0000;
      @red2: @red;
      .cls { color: @red2; border-color: @red; }
    `
    const result = await findLessVars(text)
    expect(result.some(match => match.start === text.indexOf('@red2'))).toBe(
      false,
    )
    expect(
      result.some(match => match.start === text.lastIndexOf('@red2')),
    ).toBe(true)
  })
})
