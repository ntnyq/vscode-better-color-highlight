import { describe, expect, it, vi } from 'vitest'
import {
  buildColorHoverMarkdown,
  getColorHover,
} from '../src/hover/color-hover'
import type { NestedScopedConfigs } from '../src/meta'
import type { ColorDetector } from '../src/types'

const defaultConfig: NestedScopedConfigs = {
  enable: true,
  enableHover: false,
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

describe(getColorHover, () => {
  it('reuses detector matches for the same document revision', async () => {
    const detector = vi.fn<ColorDetector>(() => [
      { start: 14, end: 21, color: 'rgb(255, 0, 0)' },
    ])
    const matchCache = new Map()
    const options = {
      config: { ...defaultConfig, enableHover: true },
      detectors: [detector],
      filePath: 'file:///tmp/example.css',
      languageId: 'css',
      matchCache,
      matchCacheKey: 'file:///tmp/example.css:1:0',
      offset: 16,
      text: '.box { color: #ff0000; }',
    }

    await getColorHover(options)
    await getColorHover(options)
    await getColorHover({
      ...options,
      matchCacheKey: 'file:///tmp/example.css:2:0',
    })

    expect(detector).toHaveBeenCalledTimes(2)
  })

  it('does not run detectors when hover is disabled', async () => {
    const detector = vi.fn<ColorDetector>(() => [
      { start: 14, end: 21, color: 'rgb(255, 0, 0)' },
    ])

    const result = await getColorHover({
      config: defaultConfig,
      detectors: [detector],
      filePath: 'file:///tmp/example.css',
      languageId: 'css',
      offset: 15,
      text: '.box { color: #ff0000; }',
    })

    expect(result).toBeNull()
    expect(detector).not.toHaveBeenCalled()
  })

  it('does not run detectors when the hover request is cancelled', async () => {
    const detector = vi.fn<ColorDetector>(() => [
      { start: 14, end: 21, color: 'rgb(255, 0, 0)' },
    ])

    const result = await getColorHover({
      cancellationToken: { isCancellationRequested: true },
      config: { ...defaultConfig, enableHover: true },
      detectors: [detector],
      filePath: 'file:///tmp/example.css',
      languageId: 'css',
      offset: 15,
      text: '.box { color: #ff0000; }',
    })

    expect(result).toBeNull()
    expect(detector).not.toHaveBeenCalled()
  })

  it('returns color presentations for the match under the offset', async () => {
    const detector = vi.fn<ColorDetector>(() => [
      { start: 14, end: 21, color: 'rgb(255, 0, 0)' },
    ])

    const result = await getColorHover({
      config: { ...defaultConfig, enableHover: true },
      detectors: [detector],
      filePath: 'file:///tmp/example.css',
      languageId: 'css',
      offset: 16,
      text: '.box { color: #ff0000; }',
    })

    expect(result).toStrictEqual({
      originalColor: 'rgb(255, 0, 0)',
      originalText: '#ff0000',
      range: { end: 21, start: 14 },
      presentations: {
        alpha: '100%',
        hex: '#ff0000',
        hsl: 'hsl(0 100% 50%)',
        oklch: 'oklch(62.8% 0.258 29.2)',
        rgb: 'rgb(255, 0, 0)',
      },
      uri: 'file:///tmp/example.css',
    })
  })

  it('returns hover data from successful detectors when another detector fails', async () => {
    const failingDetector = vi.fn<ColorDetector>(() => {
      throw new Error('detector failed')
    })
    const successfulDetector = vi.fn<ColorDetector>(() => [
      { start: 14, end: 21, color: 'rgb(255, 0, 0)' },
    ])

    const result = await getColorHover({
      config: { ...defaultConfig, enableHover: true },
      detectors: [failingDetector, successfulDetector],
      filePath: 'file:///tmp/example.css',
      languageId: 'css',
      offset: 16,
      text: '.box { color: #ff0000; }',
    })

    expect(result).toMatchObject({
      originalColor: 'rgb(255, 0, 0)',
      originalText: '#ff0000',
      range: { end: 21, start: 14 },
      presentations: {
        hex: '#ff0000',
        rgb: 'rgb(255, 0, 0)',
      },
    })
  })
})

describe(buildColorHoverMarkdown, () => {
  it('renders color formats with copy and replace icon command links', () => {
    const result = buildColorHoverMarkdown({
      originalColor: 'rgba(255, 0, 0, 0.5)',
      originalText: '#ff000080',
      range: { end: 21, start: 12 },
      presentations: {
        alpha: '50%',
        hex: '#ff000080',
        hsl: 'hsl(0 100% 50% / 0.5)',
        oklch: 'oklch(62.8% 0.258 29.2 / 0.5)',
        rgb: 'rgba(255, 0, 0, 0.5)',
      },
      uri: 'file:///tmp/example.css',
    })

    expect(result).toContain('HEX')
    expect(result).toContain('#ff000080')
    expect(result).toContain('Alpha')
    expect(result).toContain('50%')
    expect(result).not.toContain('| Format | Value | Actions |')
    expect(result).not.toContain('| --- | --- | --- |')
    expect(result).not.toContain('`HEX  `')
    expect(result).not.toContain('`RGB  `')
    expect(result).not.toContain('`HSL  `')
    expect(result).toContain('`HEX\u00A0\u00A0` `#ff000080')
    expect(result).toContain('`RGB\u00A0\u00A0` `rgba(255, 0, 0, 0.5)')
    expect(result).toContain('`HSL\u00A0\u00A0` `hsl(0 100% 50% / 0.5)')
    expect(result).toContain('`Alpha` `50%')

    const getLine = (label: string) =>
      result.split('\n\n').find(line => line.startsWith(`\`${label}`)) ?? ''

    const actionIndexes = [
      getLine('HEX\u00A0\u00A0').indexOf('[$(copy)]'),
      getLine('RGB\u00A0\u00A0').indexOf('[$(copy)]'),
      getLine('HSL\u00A0\u00A0').indexOf('[$(copy)]'),
      getLine('OKLCH').indexOf('[$(copy)]'),
      getLine('Alpha').indexOf('[$(remove)]'),
    ]

    expect(new Set(actionIndexes).size).toBe(1)
    expect(result).toContain('[$(copy)]')
    expect(result).toContain('[$(replace)]')
    expect(result).toContain('command:color-highlight.copyColorAsHex')
    expect(result).toContain('command:color-highlight.replaceColorAsHex')
    expect(result).toContain('command:color-highlight.adjustColorAlpha')
    expect(result).toContain('%22originalText%22%3A%22%23ff000080%22')
    expect(result).toContain(
      '%22originalColor%22%3A%22rgba(255%2C%200%2C%200%2C%200.5)%22',
    )
    expect(result).toContain('%22delta%22%3A-0.1')
    expect(result).toContain('%22delta%22%3A0.1')
    expect(result).toContain(
      '%22uri%22%3A%22file%3A%2F%2F%2Ftmp%2Fexample.css%22',
    )
  })
})
