import { describe, expect, it } from 'vitest'
import { findCssVars } from '../src/strategies/css-vars'
import { FIXTURE_VARS_CSS } from './fixtures'

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

  it('finds variable usages when the definition is inline in a rule block', async () => {
    const text =
      ':root { --named-red: #ff0000; } .cls { color: var(--named-red); }'
    const result = await findCssVars(text)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
    expect(text.slice(result[0].start, result[0].end)).toBe('var(--named-red)')
  })

  it('finds CSS variable usages with named-color values', async () => {
    const text = `
      :root { --named-red: red; }
      .cls { color: var(--named-red); }
    `
    const result = await findCssVars(text)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
    expect(text.slice(result[0].start, result[0].end)).toBe('var(--named-red)')
  })

  it('resolves nested CSS variable references', async () => {
    const text = `
      :root {
        --base-red: #ff0000;
        --named-red: var(--base-red);
      }
      .cls { color: var(--named-red); }
    `
    const result = await findCssVars(text)
    expect(
      result.some(
        match => text.slice(match.start, match.end) === 'var(--named-red)',
      ),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('resolves CSS shorthand triplet custom properties inside rule blocks', async () => {
    const text = `
      .css-var-shorthand {
        --brand-rgb: 255 0 0;
        --brand-hsl: 0 100% 50%;
        color: var(--brand-rgb);
        background: var(--brand-hsl);
      }
    `
    const result = await findCssVars(text)

    expect(
      result.some(
        match => text.slice(match.start, match.end) === 'var(--brand-rgb)',
      ),
    ).toBe(true)
    expect(
      result.some(
        match => text.slice(match.start, match.end) === 'var(--brand-hsl)',
      ),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('returns empty when no variables are defined', async () => {
    const result = await findCssVars('color: #ff0000;')
    expect(result).toStrictEqual([])
  })

  it('matches the expected playground CSS variable usages without false definition hits', async () => {
    const result = await findCssVars(FIXTURE_VARS_CSS)
    const usages = result.map(match =>
      FIXTURE_VARS_CSS.slice(match.start, match.end),
    )

    const expectedUsages = [
      'var(--hex-6)',
      'var(--rgb-comma)',
      'var(--hsl-comma)',
      'var(--named-red)',
      'var(--hex-8)',
      'var(--hwb)',
      'var(--oklch)',
      'var(--hex-4)',
      'var(--srgb-accent)',
      'var(--srgb-linear-accent)',
      'var(--display-p3-accent)',
      'var(--a98-accent)',
      'var(--rec2020-accent)',
      'var(--prophoto-accent)',
      'var(--xyz-accent)',
      'var(--xyz-d50-accent)',
      'var(--xyz-d65-accent)',
      'var(--token-rgb)',
      'var(--token-hsl)',
      'var(--token-lch)',
      'var(--token-oklch)',
      'var(--token-lab)',
      'var(--token-oklab)',
    ]

    const actualUniqueUsages = [...new Set(usages)]
    const missingUsages = expectedUsages.filter(
      usage => !actualUniqueUsages.includes(usage),
    )
    const falseDefinitionHits = usages.filter(usage => usage.startsWith('--'))

    expect(expectedUsages).toHaveLength(23)
    expect(actualUniqueUsages).toStrictEqual(
      expect.arrayContaining(expectedUsages),
    )
    expect(missingUsages).toStrictEqual([])
    expect(falseDefinitionHits).toStrictEqual([])
  })
})
