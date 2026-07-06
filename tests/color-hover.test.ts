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
      range: { end: 21, start: 14 },
      presentations: {
        alpha: '100%',
        hex: '#ff0000',
        hsl: 'hsl(0 100% 50%)',
        oklch: 'oklch(62.8% 0.258 29.2)',
        rgb: 'rgb(255, 0, 0)',
      },
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
      range: { end: 21, start: 14 },
      presentations: {
        hex: '#ff0000',
        rgb: 'rgb(255, 0, 0)',
      },
    })
  })
})

describe(buildColorHoverMarkdown, () => {
  it('renders color formats with copy command links', () => {
    const result = buildColorHoverMarkdown({
      alpha: '50%',
      hex: '#ff000080',
      hsl: 'hsl(0 100% 50% / 0.5)',
      oklch: 'oklch(62.8% 0.258 29.2 / 0.5)',
      rgb: 'rgba(255, 0, 0, 0.5)',
    })

    expect(result).toContain('HEX')
    expect(result).toContain('#ff000080')
    expect(result).toContain('Alpha')
    expect(result).toContain('50%')
    expect(result).toContain('command:color-highlight.copyColorAsHex')
  })
})
