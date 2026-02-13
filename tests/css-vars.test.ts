import { describe, expect, it } from 'vitest'
import { findCssVars } from '../src/strategies/css-vars'

describe(findCssVars, () => {
  it('finds CSS variable usages with hex values', async () => {
    const text = `
      --my-color: #ff0000;
      .cls { color: var(--my-color); }
    `
    const result = await findCssVars(text)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('finds CSS variable usages with rgb() values', async () => {
    const text = `
      --my-color: rgb(0, 0, 255);
      .cls { color: var(--my-color); }
    `
    const result = await findCssVars(text)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(0, 0, 255)')
  })

  it('returns empty when no variables are defined', async () => {
    const result = await findCssVars('color: #ff0000;')
    expect(result).toEqual([])
  })
})
