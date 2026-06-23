import { describe, expect, it } from 'vitest'
import { getStrategies } from '../src/core/strategy-registry'
import type { ColorMatch } from '../src/core/types'
import type { NestedScopedConfigs } from '../src/meta'

const defaultConfig: NestedScopedConfigs = {
  enable: true,
  languages: ['*'],
  matchWords: false,
  useARGB: false,
  matchRgbWithNoFunction: false,
  rgbWithNoFunctionLanguages: ['*'],
  matchHslWithNoFunction: false,
  hslWithNoFunctionLanguages: ['*'],
  markerType: 'background',
  markRuler: true,
  debug: false,
}

async function findDartMatches(text: string): Promise<ColorMatch[]> {
  const strategies = getStrategies('dart', defaultConfig)
  const results = await Promise.all(
    strategies.map(strategy => strategy(text, { languageId: 'dart' })),
  )
  return results.flat()
}

describe('dart color strategies', () => {
  it('resolves Color(0xAARRGGBB) as ARGB', async () => {
    const text = 'static const primary = Color(0xffB11016);'
    const matches = await findDartMatches(text)

    expect(matches).toStrictEqual([
      {
        start: text.indexOf('Color('),
        end: text.indexOf(';'),
        color: 'rgb(177, 16, 22)',
      },
    ])
  })

  it('resolves Color.fromARGB(alpha, red, green, blue)', async () => {
    const text = 'final color = Color.fromARGB(128, 57, 197, 187);'
    const matches = await findDartMatches(text)

    expect(matches).toStrictEqual([
      {
        start: text.indexOf('Color.fromARGB'),
        end: text.indexOf(';'),
        color: 'rgba(57, 197, 187, 0.502)',
      },
    ])
  })
})
