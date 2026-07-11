import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { NestedScopedConfigs } from '../src/meta'
import type { ColorDetector, StrategyContext } from '../src/types'
import type * as LoggerModule from '../src/utils/logger'
import type {
  ScanWorkspacePaletteOptions,
  WorkspacePaletteProgress,
} from '../src/workspace-palette/scanner'

interface TestUri {
  readonly fsPath: string
  readonly scheme: string
  readonly value: string
  readonly toString: () => string
}

const findFiles = vi.fn<(...args: unknown[]) => Promise<TestUri[]>>()
const stat =
  vi.fn<
    (value: TestUri) => Promise<{ mtime?: number; size: number; type?: number }>
  >()
const readFile = vi.fn<(value: TestUri) => Promise<Uint8Array>>()
const openTextDocument =
  vi.fn<(value: TestUri) => Promise<Vscode.TextDocument>>()
const workspaceMock = {
  findFiles,
  fs: { readFile, stat },
  openTextDocument,
  textDocuments: [] as Vscode.TextDocument[],
}
const uriMock = {
  file: (value: string) => uri(`file://${value}`),
  parse: (value: string) => uri(value),
}

vi.mock(
  import('vscode'),
  () =>
    ({
      FileType: { Directory: 2, File: 1 },
      Uri: uriMock,
      workspace: workspaceMock,
    }) as unknown as Partial<typeof Vscode>,
)
vi.mock(
  import('../src/utils/logger'),
  () =>
    ({
      logger: { error: vi.fn<(message: unknown) => void>() },
    }) as unknown as typeof LoggerModule,
)

const defaultExclude =
  '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}'

const testConfig = {
  cssVariablePaths: [],
  cssVariableTrustedSelectors: [':root', 'html', 'body', ':host'],
  debug: false,
  designTokenJsonMode: 'token-values',
  enable: true,
  enableColorNavigation: true,
  enableColorPicker: false,
  enableContrastDiagnostics: false,
  enableHover: false,
  languages: ['*'],
  markerType: 'background',
  markRuler: true,
  matchHslWithNoFunction: false,
  matchRgbWithNoFunction: false,
  matchWords: false,
  maxFileSize: 1_000_000,
  namedColorMatchMode: 'context',
  resolveCssVariablesAcrossFiles: false,
  resolveDesignTokensAcrossFiles: false,
  resolveScssVariablesAcrossFiles: false,
  rgbWithNoFunctionLanguages: ['*'],
  hslWithNoFunctionLanguages: ['*'],
  scssLoadPaths: [],
  tailwindColorMode: 'auto',
  tailwindStylesheetPaths: [],
  useARGB: false,
  workspacePaletteExclude: defaultExclude,
  workspacePaletteInclude: '**/*',
} satisfies NestedScopedConfigs

function uri(value: string): TestUri {
  const scheme = value.slice(0, value.indexOf(':'))
  return {
    fsPath: scheme === 'file' ? new URL(value).pathname : value,
    scheme,
    value,
    toString: () => value,
  }
}

function document(
  value: TestUri,
  text = '#ff0000',
  languageId = 'css',
): Vscode.TextDocument {
  return {
    getText: () => text,
    isDirty: false,
    languageId,
    uri: value,
  } as unknown as Vscode.TextDocument
}

function activeToken(): Vscode.CancellationToken {
  return { isCancellationRequested: false } as Vscode.CancellationToken
}

async function scan(overrides: Partial<ScanWorkspacePaletteOptions> = {}) {
  const { scanWorkspacePalette } =
    await import('../src/workspace-palette/scanner')
  return await scanWorkspacePalette({
    cancellationToken: activeToken(),
    config: testConfig,
    workspaceIsTrusted: true,
    ...overrides,
  })
}

describe('workspace palette scanner', () => {
  beforeEach(() => {
    findFiles.mockReset()
    stat.mockReset()
    readFile.mockReset()
    openTextDocument.mockReset()
    workspaceMock.textDocuments = []
    findFiles.mockResolvedValue([])
    stat.mockResolvedValue({ size: 7, type: 1 })
    openTextDocument.mockImplementation((value: TestUri) =>
      Promise.resolve(document(value)),
    )
  })

  it('uses exact globs and the 257th result only to report truncation', async () => {
    const values = Array.from({ length: 257 }, (_, index) =>
      uri(`memfs:///colors/${String(256 - index).padStart(3, '0')}.css`),
    )
    findFiles.mockResolvedValue(values)

    const result = await scan()

    expect(findFiles).toHaveBeenCalledWith('**/*', defaultExclude, 257)
    expect(result?.truncated).toBe(true)
    expect(result?.occurrenceTruncated).toBe(false)
    expect(result?.scannedFileCount).toBe(256)
    expect(openTextDocument).toHaveBeenCalledTimes(256)
    expect(openTextDocument.mock.calls[0]?.[0].toString()).toBe(
      'memfs:///colors/000.css',
    )
    expect(openTextDocument.mock.calls.at(-1)?.[0].toString()).toBe(
      'memfs:///colors/255.css',
    )
  })

  it('uses UTF-16 code-unit ordering before applying the 256-file cap', async () => {
    const values = Array.from({ length: 252 }, (_, index) =>
      uri(`memfs:///colors/m${String(index).padStart(3, '0')}.css`),
    )
    values.push(
      uri('memfs:///colors/z.css'),
      uri('memfs:///colors/_.css'),
      uri('memfs:///colors/A.css'),
      uri('memfs:///colors/a.css'),
      uri('memfs:///colors/É.css'),
    )
    findFiles.mockResolvedValue(values)

    await scan()

    const opened = openTextDocument.mock.calls.map(([value]) =>
      value.toString(),
    )
    expect(opened).toContain('memfs:///colors/_.css')
    expect(opened).toContain('memfs:///colors/z.css')
    expect(opened).not.toContain('memfs:///colors/É.css')
    expect(opened.indexOf('memfs:///colors/A.css')).toBeLessThan(
      opened.indexOf('memfs:///colors/a.css'),
    )
  })

  it('uses one immutable configuration snapshot across async file scanning', async () => {
    const values = [uri('memfs:///a.css'), uri('memfs:///b.css')]
    const mutableConfig: NestedScopedConfigs = {
      ...testConfig,
      cssVariablePaths: ['initial.css'],
      languages: ['css'],
      scssLoadPaths: ['initial-scss'],
      tailwindStylesheetPaths: ['initial-tailwind.css'],
    }
    findFiles.mockImplementation(() => {
      mutableConfig.cssVariablePaths.push('mutated.css')
      mutableConfig.languages.push('!css')
      mutableConfig.scssLoadPaths.push('mutated-scss')
      mutableConfig.tailwindStylesheetPaths.push('mutated-tailwind.css')
      mutableConfig.namedColorMatchMode = 'never'
      return Promise.resolve(values)
    })
    const contexts: StrategyContext[] = []
    const detector = vi.fn<ColorDetector>((_text, context) => {
      contexts.push(context!)
      return []
    })
    const registry = await import('../src/core/strategy-registry')
    const strategies = vi
      .spyOn(registry, 'getStrategies')
      .mockReturnValue([detector])

    const result = await scan({ config: mutableConfig })

    expect(result?.scannedFileCount).toBe(2)
    expect(contexts).toHaveLength(2)
    expect(
      contexts.every(context => context.namedColorMatchMode === 'context'),
    ).toBe(true)
    expect(
      contexts.every(context => context.cssVariablePaths?.length === 1),
    ).toBe(true)
    expect(contexts.every(context => context.scssLoadPaths?.length === 1)).toBe(
      true,
    )
    expect(
      contexts.every(context => context.tailwindStylesheetPaths?.length === 1),
    ).toBe(true)
    strategies.mockRestore()
  })

  it('caps retained occurrences per file and globally while streaming', async () => {
    const values = Array.from({ length: 11 }, (_, index) =>
      uri(`memfs:///dense-${index}.css`),
    )
    findFiles.mockResolvedValue(values)
    const detector = vi.fn<ColorDetector>(() =>
      Array.from({ length: 2500 }, (_, index) => ({
        color: 'rgb(255, 0, 0)',
        end: index * 2 + 1,
        start: index * 2,
      })),
    )
    openTextDocument.mockImplementation(value =>
      Promise.resolve(document(value, 'x'.repeat(5000))),
    )
    stat.mockResolvedValue({ size: 5000 })
    const registry = await import('../src/core/strategy-registry')
    const strategies = vi
      .spyOn(registry, 'getStrategies')
      .mockReturnValue([detector])

    const result = await scan()

    expect(result?.occurrenceTruncated).toBe(true)
    expect(result?.groups[0]?.occurrences).toHaveLength(20_000)
    expect(result?.scannedFileCount).toBe(10)
    expect(openTextDocument).toHaveBeenCalledTimes(10)
    strategies.mockRestore()
  })

  it('returns an empty non-truncated palette for an empty workspace', async () => {
    await expect(scan()).resolves.toStrictEqual({
      groups: [],
      occurrenceTruncated: false,
      scannedFileCount: 0,
      skippedFileCount: 0,
      truncated: false,
    })
  })

  it('skips disk/text byte overflow, character overflow, NUL, and excluded languages', async () => {
    const values = [
      uri('memfs:///disk-large.css'),
      uri('memfs:///utf8-large.css'),
      uri('memfs:///char-large.css'),
      uri('memfs:///binary.css'),
      uri('memfs:///excluded.css'),
      uri('memfs:///included.css'),
    ]
    findFiles.mockResolvedValue(values)
    stat.mockImplementation((value: TestUri) =>
      Promise.resolve({
        size: value.value.includes('disk-large') ? 524_289 : 7,
      }),
    )
    openTextDocument.mockImplementation((value: TestUri) => {
      if (value.value.includes('utf8-large')) {
        return Promise.resolve(document(value, 'é'.repeat(262_145)))
      }
      if (value.value.includes('char-large')) {
        return Promise.resolve(document(value, 'x'.repeat(11)))
      }
      if (value.value.includes('binary')) {
        return Promise.resolve(document(value, `abc\0${'#f00'.repeat(3000)}`))
      }
      if (value.value.includes('excluded')) {
        return Promise.resolve(document(value, '#f00', 'plaintext'))
      }
      return Promise.resolve(document(value))
    })

    const result = await scan({
      config: { ...testConfig, languages: ['css'], maxFileSize: 10 },
    })

    expect(result?.scannedFileCount).toBe(1)
    expect(result?.skippedFileCount).toBe(5)
    expect(result?.groups[0]?.occurrences[0]).toStrictEqual(
      expect.objectContaining({
        sourceText: '#ff0000',
        uri: 'memfs:///included.css',
      }),
    )
    expect(openTextDocument).toHaveBeenCalledTimes(5)
  })

  it('accepts exactly 512 KiB and rejects the next UTF-8 byte', async () => {
    const diskExact = uri('memfs:///disk-exact.css')
    const diskOver = uri('memfs:///disk-over.css')
    const textExact = uri('memfs:///text-exact.css')
    const textOver = uri('memfs:///text-over.css')
    findFiles.mockResolvedValue([diskExact, diskOver, textExact, textOver])
    stat.mockImplementation((value: TestUri) =>
      Promise.resolve({ size: value === diskOver ? 524_289 : 524_288 }),
    )
    openTextDocument.mockImplementation((value: TestUri) => {
      if (value === textExact) {
        return Promise.resolve(document(value, 'é'.repeat(262_144)))
      }
      if (value === textOver) {
        return Promise.resolve(document(value, `${'é'.repeat(262_144)}x`))
      }
      return Promise.resolve(document(value))
    })
    const registry = await import('../src/core/strategy-registry')
    const strategies = vi.spyOn(registry, 'getStrategies').mockReturnValue([])

    const result = await scan({ config: { ...testConfig, maxFileSize: 0 } })

    expect(result?.scannedFileCount).toBe(2)
    expect(result?.skippedFileCount).toBe(2)
    strategies.mockRestore()
  })

  it('isolates stat/open failures and detector failures per file', async () => {
    const values = [
      uri('memfs:///open-fails.css'),
      uri('memfs:///stat-fails.css'),
      uri('memfs:///works.css'),
    ]
    findFiles.mockResolvedValue(values)
    stat.mockImplementation((value: TestUri) =>
      value.value.includes('stat-fails')
        ? Promise.reject(new Error('unreadable'))
        : Promise.resolve({ size: 7 }),
    )
    openTextDocument.mockImplementation((value: TestUri) =>
      value.value.includes('open-fails')
        ? Promise.reject(new Error('cannot open'))
        : Promise.resolve(document(value)),
    )
    const registry = await import('../src/core/strategy-registry')
    const failingDetector = vi.fn<ColorDetector>(() => {
      throw new Error('bad detector')
    })
    const directDetector = vi.fn<ColorDetector>(() => [
      { color: 'rgb(255, 0, 0)', end: 7, start: 0 },
    ])
    const strategies = vi
      .spyOn(registry, 'getStrategies')
      .mockReturnValue([failingDetector, directDetector])

    const result = await scan()

    expect(result?.scannedFileCount).toBe(1)
    expect(result?.skippedFileCount).toBe(2)
    expect(result?.groups).toHaveLength(1)
    strategies.mockRestore()
  })

  it('uses open unsaved and virtual documents only when returned by the query', async () => {
    const queried = uri('git:/repo/colors.css')
    const unqueried = document(uri('untitled:Untitled-1'), '#00ff00')
    const unsaved = document(queried, '#0000ff')
    workspaceMock.textDocuments = [unsaved, unqueried]
    findFiles.mockResolvedValue([queried])
    openTextDocument.mockResolvedValue(unsaved)

    const result = await scan()

    expect(result?.groups).toHaveLength(1)
    expect(result?.groups[0]?.presentations.hex).toBe('#0000ff')
    expect(result?.groups[0]?.occurrences[0]?.uri).toBe('git:/repo/colors.css')
    expect(
      result?.groups.flatMap(group => group.occurrences),
    ).not.toContainEqual(
      expect.objectContaining({ uri: 'untitled:Untitled-1' }),
    )
  })

  it('scans direct colors while untrusted and shares one exact 512-read budget', async () => {
    const values = [uri('memfs:///a.css'), uri('memfs:///b.css')]
    findFiles.mockResolvedValue(values)
    const contexts: StrategyContext[] = []
    const detector = vi.fn<ColorDetector>((_text, context) => {
      contexts.push(context!)
      return [{ color: 'rgb(255, 0, 0)', end: 7, start: 0 }]
    })
    const registry = await import('../src/core/strategy-registry')
    const strategies = vi
      .spyOn(registry, 'getStrategies')
      .mockReturnValue([detector])

    const result = await scan({ workspaceIsTrusted: false })

    expect(result?.groups).toHaveLength(1)
    expect(contexts).toHaveLength(2)
    expect(
      contexts.every(context => context.workspaceIsTrusted === false),
    ).toBe(true)
    expect(contexts[0]?.workspaceReadBudget).toBe(
      contexts[1]?.workspaceReadBudget,
    )
    const budget = contexts[0]!.workspaceReadBudget!
    expect(
      Array.from({ length: 512 }, (_, index) =>
        budget.tryClaim(`memfs:///dependency/${index}.css`),
      ).every(Boolean),
    ).toBe(true)
    expect(budget.tryClaim('memfs:///dependency/512.css')).toBe(false)
    expect(budget.tryClaim('memfs:///dependency/0.css')).toBe(true)
    strategies.mockRestore()
  })

  it('keeps direct scanning untrusted and resolves real CSS dependencies only when trusted', async () => {
    const entryUri = uri('memfs:///entry.css')
    const dependencyUri = uri('memfs:/tokens.css')
    const entryText = '.example { color: #ff0000; background: var(--brand); }'
    const dependencyText = ':root { --brand: #336699; }'
    findFiles.mockResolvedValue([entryUri])
    openTextDocument.mockResolvedValue(document(entryUri, entryText))
    stat.mockImplementation(value => {
      if (value.toString() === entryUri.toString()) {
        return Promise.resolve({ mtime: 1, size: entryText.length, type: 1 })
      }
      if (value.toString() === dependencyUri.toString()) {
        return Promise.resolve({
          mtime: 1,
          size: dependencyText.length,
          type: 1,
        })
      }
      return Promise.reject(new Error(`Unexpected stat: ${value.toString()}`))
    })
    readFile.mockImplementation(value => {
      if (value.toString() === dependencyUri.toString()) {
        return Promise.resolve(new TextEncoder().encode(dependencyText))
      }
      return Promise.reject(new Error(`Unexpected read: ${value.toString()}`))
    })
    const config = {
      ...testConfig,
      cssVariablePaths: ['tokens.css'],
      resolveCssVariablesAcrossFiles: true,
    }

    const untrusted = await scan({ config, workspaceIsTrusted: false })

    expect(
      untrusted?.groups.map(group => group.presentations.hex),
    ).toStrictEqual(['#ff0000'])
    expect(findFiles).toHaveBeenCalledTimes(1)
    expect(
      stat.mock.calls.filter(
        ([value]) => value.toString() === dependencyUri.toString(),
      ),
    ).toHaveLength(0)
    expect(readFile).not.toHaveBeenCalled()

    findFiles.mockClear()
    stat.mockClear()
    readFile.mockClear()

    const trusted = await scan({ config, workspaceIsTrusted: true })

    expect(findFiles).toHaveBeenCalledTimes(1)
    expect(stat.mock.calls.map(([value]) => value.toString())).toStrictEqual([
      entryUri.toString(),
      dependencyUri.toString(),
      dependencyUri.toString(),
    ])
    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile.mock.calls[0]?.[0].toString()).toBe(
      dependencyUri.toString(),
    )
    expect(
      new Set(trusted?.groups.map(group => group.presentations.hex)),
    ).toStrictEqual(new Set(['#336699', '#ff0000']))
  })

  it('reports cumulative counts after every candidate', async () => {
    findFiles.mockResolvedValue([
      uri('memfs:///bad.css'),
      uri('memfs:///ok.css'),
    ])
    stat
      .mockRejectedValueOnce(new Error('bad'))
      .mockResolvedValueOnce({ size: 7 })
    const onProgress = vi.fn<(progress: WorkspacePaletteProgress) => void>()

    await scan({ onProgress })

    expect(onProgress.mock.calls.map(call => call[0])).toStrictEqual([
      {
        occurrenceTruncated: false,
        processedFileCount: 1,
        scannedFileCount: 0,
        skippedFileCount: 1,
        totalFileCount: 2,
        truncated: false,
      },
      {
        occurrenceTruncated: false,
        processedFileCount: 2,
        scannedFileCount: 1,
        skippedFileCount: 1,
        totalFileCount: 2,
        truncated: false,
      },
    ])
  })

  it('validates empty and invalid globs before exposing partial data', async () => {
    const { WorkspacePaletteScanConfigurationError } =
      await import('../src/workspace-palette/scanner')

    await expect(
      scan({ config: { ...testConfig, workspacePaletteInclude: '  ' } }),
    ).rejects.toBeInstanceOf(WorkspacePaletteScanConfigurationError)
    expect(findFiles).not.toHaveBeenCalled()

    findFiles.mockRejectedValueOnce(new Error('invalid glob'))
    await expect(
      scan({ config: { ...testConfig, workspacePaletteExclude: '[' } }),
    ).rejects.toBeInstanceOf(WorkspacePaletteScanConfigurationError)
  })

  it.each([
    ['before findFiles', [0, 0, 0, 0]],
    ['after findFiles', [1, 0, 0, 0]],
    ['after stat', [1, 1, 0, 0]],
    ['after openTextDocument', [1, 1, 1, 0]],
    ['after detectors', [1, 1, 1, 1]],
  ] as const)(
    'returns null when cancelled %s',
    async (boundary, [findCount, statCount, openCount, detectorCount]) => {
      let cancelled = boundary === 'before findFiles'
      const value = uri('memfs:///colors.css')
      findFiles.mockImplementation(() => {
        if (boundary === 'after findFiles') {
          cancelled = true
        }
        return Promise.resolve([value])
      })
      stat.mockImplementation(() => {
        if (boundary === 'after stat') {
          cancelled = true
        }
        return Promise.resolve({ size: 7 })
      })
      openTextDocument.mockImplementation(() => {
        if (boundary === 'after openTextDocument') {
          cancelled = true
        }
        return Promise.resolve(document(value))
      })
      const detector = vi.fn<ColorDetector>(() => {
        if (boundary === 'after detectors') {
          cancelled = true
        }
        return Promise.resolve([])
      })
      const registry = await import('../src/core/strategy-registry')
      const strategies = vi
        .spyOn(registry, 'getStrategies')
        .mockReturnValue([detector])
      const cancellationToken = {
        get isCancellationRequested() {
          return cancelled
        },
      } as Vscode.CancellationToken

      await expect(scan({ cancellationToken })).resolves.toBeNull()
      expect(findFiles).toHaveBeenCalledTimes(findCount)
      expect(stat).toHaveBeenCalledTimes(statCount)
      expect(openTextDocument).toHaveBeenCalledTimes(openCount)
      expect(detector).toHaveBeenCalledTimes(detectorCount)
      strategies.mockRestore()
    },
  )
})
