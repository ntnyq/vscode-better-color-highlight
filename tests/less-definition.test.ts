import { describe, expect, it } from 'vitest'
import {
  findLessVars,
  resolveLessVarDefinition,
} from '../src/strategies/less-vars'

describe(resolveLessVarDefinition, () => {
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
