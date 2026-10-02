import { describe, expect, it, vi } from 'vitest'
import { findLessVars } from '../src/engine/strategies/less-vars'
import { findScssVars } from '../src/engine/strategies/scss-vars'
import { resolveVariableColors } from '../src/engine/strategies/shared/variable-colors'
import { findStylusVars } from '../src/engine/strategies/stylus-vars'

describe(resolveVariableColors, () => {
  it.each([false, true])(
    'resolves a long shared chain once per definition (reverse=%s)',
    async reverse => {
      const definitions = new Map<string, string>([['v0', '#ff0000']])
      for (let index = 1; index <= 2000; index++) {
        definitions.set(`v${index}`, `$v${index - 1}`)
      }
      const resolveLiteral = vi.fn<(value: string) => Promise<string | null>>(
        value => Promise.resolve(value === '#ff0000' ? 'rgb(255, 0, 0)' : null),
      )
      const colors = await resolveVariableColors(
        reverse ? new Map([...definitions].toReversed()) : definitions,
        value => (value.startsWith('$') ? value.slice(1) : null),
        resolveLiteral,
      )
      expect(colors.size).toBe(definitions.size)
      expect(colors.get('v2000')).toBe('rgb(255, 0, 0)')
      expect(resolveLiteral).toHaveBeenCalledTimes(definitions.size)
    },
  )

  it('caches cycles, missing aliases, and unresolved values', async () => {
    const definitions = new Map([
      ['a', '$b'],
      ['b', '$a'],
      ['c', '$a'],
      ['missing', '$absent'],
      ['bad', 'not-a-color'],
    ])
    const resolveLiteral = vi.fn<() => Promise<null>>(() =>
      Promise.resolve(null),
    )
    await expect(
      resolveVariableColors(
        definitions,
        value => (value.startsWith('$') ? value.slice(1) : null),
        resolveLiteral,
      ),
    ).resolves.toStrictEqual(new Map())
    expect(resolveLiteral).toHaveBeenCalledTimes(definitions.size)
  })

  it('stops cancelled work without returning partial colors', async () => {
    const signal = { isCancellationRequested: false }
    const resolveLiteral = vi.fn<() => Promise<string>>(() => {
      signal.isCancellationRequested = true
      return Promise.resolve('rgb(255, 0, 0)')
    })
    const colors = await resolveVariableColors(
      new Map([
        ['a', 'red'],
        ['b', 'blue'],
      ]),
      () => null,
      resolveLiteral,
      signal,
    )
    expect(colors.size).toBe(0)
    expect(resolveLiteral).toHaveBeenCalledTimes(1)
  })
})

describe('stylesheet variable chains', () => {
  it.each([
    { detector: findScssVars, languageId: 'scss', prefix: '$', delimiter: ':' },
    { detector: findLessVars, languageId: 'less', prefix: '@', delimiter: ':' },
    {
      detector: findStylusVars,
      languageId: 'stylus',
      prefix: '$',
      delimiter: '=',
    },
  ])(
    'resolves 1200 aliases in $languageId',
    async ({ detector, languageId, prefix, delimiter }) => {
      const definitions = [`${prefix}v0 ${delimiter} #ff0000;`]
      for (let index = 1; index <= 1200; index++) {
        definitions.push(
          `${prefix}v${index} ${delimiter} ${prefix}v${index - 1};`,
        )
      }
      // Sass evaluates assignments immediately; forward aliases are invalid.
      const orderedDefinitions =
        languageId === 'scss' ? definitions : definitions.toReversed()
      const text = `${orderedDefinitions.join('\n')}\na { color: ${prefix}v1200; }`
      const matches = await detector(text, { languageId })
      expect(matches.at(-1)).toMatchObject({
        start: text.lastIndexOf(`${prefix}v1200`),
        color: 'rgb(255, 0, 0)',
      })
      await expect(
        detector(text, {
          languageId,
          signal: { isCancellationRequested: true },
        }),
      ).resolves.toStrictEqual([])
    },
  )
})
