import { describe, expect, it } from 'vitest'
import {
  getStrategies,
  shouldProcessLanguage,
} from '../src/core/strategy-registry'
import type { NestedScopedConfigs } from '../src/meta'
import { findColorFunctions } from '../src/strategies/color-functions'
import { findHexRGBA, findHexARGB } from '../src/strategies/hex'
import { findHslNoFunction } from '../src/strategies/hsl-no-fn'
import { findHwb } from '../src/strategies/hwb'
import { findJsonDesignTokens } from '../src/strategies/json-design-tokens'
import { findNamedColors } from '../src/strategies/named-colors'
import { findRgbNoFunction } from '../src/strategies/rgb-no-fn'
import { findTailwindThemeColors } from '../src/strategies/tailwind-theme-colors'

const defaultConfig: NestedScopedConfigs = {
  enable: true,
  languages: ['*'],
  matchWords: false,
  namedColorMatchMode: 'context',
  resolveScssVariablesAcrossFiles: false,
  scssLoadPaths: [],
  resolveCssVariablesAcrossFiles: false,
  cssVariablePaths: [],
  cssVariableTrustedSelectors: [':root', 'html', 'body', ':host'],
  maxFileSize: 1_000_000,
  designTokenJsonMode: 'token-values',
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

  it('includes Tailwind theme colors for non-JSON languages', () => {
    const strategies = getStrategies('typescriptreact', defaultConfig)

    expect(strategies).toContain(findTailwindThemeColors)
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

  it('excludes named colors when named color mode is never', () => {
    const config = { ...defaultConfig, namedColorMatchMode: 'never' as const }
    const strategies = getStrategies('css', config)

    expect(strategies).not.toContain(findNamedColors)
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

  it('uses JSON design token strategy for json documents', () => {
    const strategies = getStrategies('json', defaultConfig)

    expect(strategies).toContain(findJsonDesignTokens)
    expect(strategies).not.toContain(findHexRGBA)
    expect(strategies).not.toContain(findColorFunctions)
    expect(strategies).not.toContain(findHwb)
    expect(strategies).not.toContain(findTailwindThemeColors)
  })

  it('uses JSON design token strategy for jsonc documents', () => {
    const strategies = getStrategies('jsonc', defaultConfig)

    expect(strategies).toContain(findJsonDesignTokens)
    expect(strategies).not.toContain(findHexRGBA)
    expect(strategies).not.toContain(findColorFunctions)
    expect(strategies).not.toContain(findHwb)
  })

  it('skips JSON design token strategy when disabled', () => {
    const strategies = getStrategies('json', {
      ...defaultConfig,
      designTokenJsonMode: 'off',
    })

    expect(strategies).not.toContain(findJsonDesignTokens)
    expect(strategies).not.toContain(findHexRGBA)
    expect(strategies).not.toContain(findColorFunctions)
    expect(strategies).not.toContain(findHwb)
  })

  it('excludes bare RGB and HSL strategies for json documents', () => {
    const strategies = getStrategies('json', {
      ...defaultConfig,
      matchRgbWithNoFunction: true,
      matchHslWithNoFunction: true,
    })

    expect(strategies).not.toContain(findRgbNoFunction)
    expect(strategies).not.toContain(findHslNoFunction)
  })

  it('excludes bare RGB and HSL strategies for jsonc documents', () => {
    const strategies = getStrategies('jsonc', {
      ...defaultConfig,
      matchRgbWithNoFunction: true,
      matchHslWithNoFunction: true,
    })

    expect(strategies).not.toContain(findRgbNoFunction)
    expect(strategies).not.toContain(findHslNoFunction)
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
