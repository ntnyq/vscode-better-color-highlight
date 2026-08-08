import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { NestedScopedConfigs } from '../src/meta'
import type * as LoggerModule from '../src/shared/logger'

const configSnapshot = {
  matchWords: false,
  namedColorMatchMode: 'context',
  tailwindColorMode: 'auto',
  tailwindStylesheetPaths: [],
  resolveScssVariablesAcrossFiles: false,
  scssLoadPaths: [],
  resolveCssVariablesAcrossFiles: false,
  cssVariablePaths: [],
  cssVariableTrustedSelectors: [],
  designTokenJsonMode: 'token-values',
  resolveDesignTokensAcrossFiles: false,
  useARGB: false,
  matchAnsiEscapeCodes: false,
  ansiPalette: {},
  matchRgbWithNoFunction: false,
  rgbWithNoFunctionLanguages: ['*'],
  matchHslWithNoFunction: false,
  hslWithNoFunctionLanguages: ['*'],
} as unknown as NestedScopedConfigs

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      defineConfig: () => configSnapshot,
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(import('vscode'), () => ({}) as Partial<typeof Vscode>)

vi.mock(
  import('../src/shared/logger'),
  () =>
    ({
      logger: {
        error: vi.fn<(message?: unknown) => void>(),
        info: vi.fn<(message?: unknown) => void>(),
      },
    }) as unknown as Partial<typeof LoggerModule>,
)

describe('hover match cache signature', () => {
  it('changes with detector configuration', async () => {
    const { createHoverMatchCacheKey } =
      await import('../src/features/hover/use-color-hover')
    const createKey = () =>
      createHoverMatchCacheKey('file:///example.html', 1, 'html', 0, true)
    const initial = createKey()

    configSnapshot.tailwindColorMode = 'v4'
    const modeChanged = createKey()
    configSnapshot.tailwindStylesheetPaths = ['theme.css']
    const pathsChanged = createKey()
    configSnapshot.matchAnsiEscapeCodes = true
    const ansiEnabled = createKey()
    configSnapshot.ansiPalette = { red: '#ff0000' }
    const ansiPaletteChanged = createKey()

    expect(modeChanged).not.toBe(initial)
    expect(pathsChanged).not.toBe(modeChanged)
    expect(ansiEnabled).not.toBe(pathsChanged)
    expect(ansiPaletteChanged).not.toBe(ansiEnabled)
  })
})
