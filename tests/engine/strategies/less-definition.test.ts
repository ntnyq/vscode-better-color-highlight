import { describe, expect, it } from 'vitest'
import {
  findLessVars,
  resolveLessVarDefinition,
} from '../../../src/engine/strategies/less-vars'

describe(resolveLessVarDefinition, () => {
  it('resolves nested, sibling, and outer usages in their own scopes', async () => {
    const text =
      '@brand: red; .inner { @brand: blue; color: @brand; .child { color: @brand; } } .outer { color: @brand; }'
    const matches = await findLessVars(text)
    expect(matches.map(match => match.color)).toStrictEqual([
      'rgb(0, 0, 255)',
      'rgb(0, 0, 255)',
      'rgb(255, 0, 0)',
    ])
    for (const [index, match] of matches.entries()) {
      const target = await resolveLessVarDefinition(text, match.start)
      const start = index < 2 ? text.indexOf('@brand: blue') : 0
      expect(target?.targetSelectionRange).toStrictEqual({
        start,
        end: start + 6,
      })
    }
  })

  it('evaluates inherited aliases lazily using the reference scope', async () => {
    const text =
      '@alias: @brand; @brand: red; .inner { color: @alias; @brand: green; @brand: blue; } .outer { color: @alias; }'
    const matches = await findLessVars(text)
    expect(matches.map(match => match.color)).toStrictEqual([
      'rgb(255, 0, 0)',
      'rgb(0, 0, 255)',
      'rgb(255, 0, 0)',
    ])
    const target = await resolveLessVarDefinition(
      text,
      text.indexOf('color: @alias') + 7,
    )
    expect(target?.targetSelectionRange.start).toBe(
      text.indexOf('@brand: blue'),
    )
  })

  it('keeps child-only variables private and skips comments and strings', async () => {
    const text =
      '.inner { @brand: red; } /* @brand: blue; */ // @brand: blue;\n.a { content: "@brand: blue;"; color: @brand; }'
    await expect(findLessVars(text)).resolves.toStrictEqual([])
    await expect(
      resolveLessVarDefinition(text, text.lastIndexOf('@brand')),
    ).resolves.toBeNull()
  })

  it('resolves a direct color usage to its exact declaration ranges', async () => {
    const text = '@brand: #336699;\n.button { color: @brand; }'
    const usage = text.lastIndexOf('@brand')

    await expect(
      resolveLessVarDefinition(text, usage + 2, {
        filePath: '/workspace/main.less',
      }),
    ).resolves.toStrictEqual({
      originRange: { start: usage, end: usage + 6 },
      targetFilePath: '/workspace/main.less',
      targetRange: { start: 0, end: 15 },
      targetSelectionRange: { start: 0, end: 6 },
    })
  })

  it('follows aliases to the final color declaration', async () => {
    const text = '@base: #123456;\n@brand: @base;\na { color: @brand; }'
    const usage = text.lastIndexOf('@brand')

    const target = await resolveLessVarDefinition(text, usage, {
      filePath: '/workspace/main.less',
    })

    expect(target?.targetSelectionRange).toStrictEqual({ start: 0, end: 5 })
  })

  it('calculates the value range after the declaration delimiter', async () => {
    const text = '@red:red;\n.a { color: @red; }'

    const target = await resolveLessVarDefinition(
      text,
      text.lastIndexOf('@red'),
    )

    expect(target?.targetRange).toStrictEqual({ start: 0, end: 8 })
  })

  it.each(['foo@brand', '@@brand'])(
    'rejects malformed token %s consistently with detection',
    async token => {
      const text = `@brand: red;\n.a { color: ${token}; }`

      await expect(
        resolveLessVarDefinition(text, text.lastIndexOf('@brand') + 1),
      ).resolves.toBeNull()
      await expect(findLessVars(text)).resolves.toStrictEqual([])
    },
  )

  it('uses the last definition and excludes definition tokens', async () => {
    const text = '@brand: #111;\n@brand: #222;\na { color: @brand; }'

    await expect(resolveLessVarDefinition(text, 2)).resolves.toBeNull()
    const target = await resolveLessVarDefinition(
      text,
      text.lastIndexOf('@brand') + 2,
    )
    expect(target?.targetSelectionRange).toStrictEqual({
      start: text.indexOf('@brand', 1),
      end: text.indexOf('@brand', 1) + 6,
    })
  })

  it.each([
    '@missing: @nope;\na { color: @missing; }',
    '@spacing: 1rem;\na { color: @spacing; }',
    '@a: @b;\n@b: @a;\na { color: @a; }',
  ])('returns null for missing, non-color, or cyclic values', async text => {
    await expect(
      resolveLessVarDefinition(text, text.lastIndexOf('@') + 1),
    ).resolves.toBeNull()
  })
})
