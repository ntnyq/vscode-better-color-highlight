import { describe, expect, it } from 'vitest'
import { findLessVars } from '../src/strategies/less-vars'
import { FIXTURE_LESS } from './fixtures'

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

  it('keeps detector output on usages when the last definition wins', async () => {
    const text = '@brand: #111111;\n@brand: #222222;\na { color: @brand; }'
    const result = await findLessVars(text)

    expect(result).toStrictEqual([
      {
        start: text.lastIndexOf('@brand'),
        end: text.lastIndexOf('@brand') + 6,
        color: 'rgb(34, 34, 34)',
      },
    ])
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

  it('skips Less variable values that are composite expressions', async () => {
    const text = `
      @red: #ff0000;
      @border-token: 1px solid red;
      @mixed-token: color-mix(in srgb, @red, white);
      .cls {
        border: @border-token;
        color: @mixed-token;
      }
    `
    const result = await findLessVars(text)
    const usages = result.map(match => text.slice(match.start, match.end))

    expect(usages).not.toStrictEqual(
      expect.arrayContaining(['@border-token', '@mixed-token']),
    )
  })

  it('matches the expected playground Less variable usages without false property hits', async () => {
    const result = await findLessVars(FIXTURE_LESS)
    const usages = result.map(match =>
      FIXTURE_LESS.slice(match.start, match.end),
    )

    const expectedUsages = [
      '@hex-6',
      '@rgb-comma',
      '@hsl-comma',
      '@named-red',
      '@hex-8',
      '@hwb',
      '@oklch',
      '@hex-4',
      '@root-red',
      '@root-red-2',
      '@root-panel',
      '@local-border',
      '@local-fill',
      '@red2',
      '@red-long',
      '@red',
      '@named-brand',
      '@display-p3-accent',
      '@rec2020-accent',
      '@prophoto-accent',
    ]

    const actualUniqueUsages = [
      ...new Set(usages.filter(usageText => usageText.startsWith('@'))),
    ]
    const missingUsages = expectedUsages.filter(
      usage => !actualUniqueUsages.includes(usage),
    )
    const falsePropertyHits = usages.filter(usage =>
      [
        'color',
        'background',
        'border-color',
        'outline-color',
        'border-bottom',
      ].includes(usage),
    )

    expect(expectedUsages).toHaveLength(20)
    expect(actualUniqueUsages).toStrictEqual(
      expect.arrayContaining(expectedUsages),
    )
    expect(missingUsages).toStrictEqual([])
    expect(falsePropertyHits).toStrictEqual([])
  })
})
