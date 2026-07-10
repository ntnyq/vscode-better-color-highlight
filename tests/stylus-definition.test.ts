import { describe, expect, it } from 'vitest'
import { resolveStylusVarDefinition } from '../src/strategies/stylus-vars'

describe(resolveStylusVarDefinition, () => {
  it('resolves direct colors with exact ranges for bare variables', async () => {
    const text = 'brand = #336699\na\n  color brand'
    const usage = text.lastIndexOf('brand')

    await expect(
      resolveStylusVarDefinition(text, usage + 2, {
        filePath: '/workspace/main.styl',
      }),
    ).resolves.toStrictEqual({
      originRange: { start: usage, end: usage + 5 },
      targetFilePath: '/workspace/main.styl',
      targetRange: { start: 0, end: 15 },
      targetSelectionRange: { start: 0, end: 5 },
    })
  })

  it('follows $ aliases to the final color declaration', async () => {
    const text = '$base: #123456\n$brand = $base\na\n  color $brand'
    const usage = text.lastIndexOf('$brand')
    const target = await resolveStylusVarDefinition(text, usage)

    expect(target?.targetSelectionRange).toStrictEqual({ start: 0, end: 5 })
  })

  it('calculates the value range after the declaration delimiter', async () => {
    const text = 'red=red\na\n  color red'

    const target = await resolveStylusVarDefinition(
      text,
      text.lastIndexOf('red'),
    )

    expect(target?.targetRange).toStrictEqual({ start: 0, end: 7 })
  })

  it('uses the last definition and excludes definition tokens', async () => {
    const text = 'brand = #111\nbrand = #222\na\n  color brand'
    await expect(resolveStylusVarDefinition(text, 2)).resolves.toBeNull()
    const target = await resolveStylusVarDefinition(
      text,
      text.lastIndexOf('brand'),
    )
    expect(target?.targetSelectionRange).toStrictEqual({ start: 13, end: 18 })
  })

  it.each([
    'missing = nope\na\n  color missing',
    'spacing = 1rem\na\n  color spacing',
    'a = b\nb = a\nc\n  color a',
  ])('returns null for missing, non-color, or cyclic values', async text => {
    await expect(
      resolveStylusVarDefinition(text, text.lastIndexOf('color') + 7),
    ).resolves.toBeNull()
  })
})
