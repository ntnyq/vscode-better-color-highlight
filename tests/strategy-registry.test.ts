import { describe, expect, it } from 'vitest'
import {
  getStrategies,
  shouldProcessLanguage,
} from '../src/core/strategy-registry'
import type { HighlightConfig } from '../src/core/types'
import { findColorFunctions } from '../src/strategies/color-functions'
import { findHexRGBA, findHexARGB } from '../src/strategies/hex'
import { findHwb } from '../src/strategies/hwb'
import { findNamedColors } from '../src/strategies/named-colors'

const defaultConfig: HighlightConfig = {
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

describe(getStrategies, () => {
  it('includes hex, color functions, and hwb for all languages', () => {
    const strategies = getStrategies('typescript', defaultConfig)
    expect(strategies).toContain(findHexRGBA)
    expect(strategies).toContain(findColorFunctions)
    expect(strategies).toContain(findHwb)
  })

  it('uses ARGB mode when configured', () => {
    const config = { ...defaultConfig, useARGB: true }
    const strategies = getStrategies('typescript', config)
    expect(strategies).toContain(findHexARGB)
    expect(strategies).not.toContain(findHexRGBA)
  })

  it('includes named colors for CSS languages', () => {
    const strategies = getStrategies('css', defaultConfig)
    expect(strategies).toContain(findNamedColors)
  })

  it('includes named colors when matchWords is true', () => {
    const config = { ...defaultConfig, matchWords: true }
    const strategies = getStrategies('typescript', config)
    expect(strategies).toContain(findNamedColors)
  })

  it('excludes named colors for non-CSS languages when matchWords is false', () => {
    const strategies = getStrategies('typescript', defaultConfig)
    expect(strategies).not.toContain(findNamedColors)
  })
})

describe(shouldProcessLanguage, () => {
  it('matches all languages with "*"', () => {
    expect(shouldProcessLanguage('css', ['*'])).toBe(true)
    expect(shouldProcessLanguage('typescript', ['*'])).toBe(true)
  })

  it('excludes languages with "!" prefix', () => {
    expect(shouldProcessLanguage('css', ['*', '!css'])).toBe(false)
    expect(shouldProcessLanguage('typescript', ['*', '!css'])).toBe(true)
  })

  it('matches specific languages', () => {
    expect(shouldProcessLanguage('css', ['css', 'scss'])).toBe(true)
    expect(shouldProcessLanguage('typescript', ['css', 'scss'])).toBe(false)
  })
})
