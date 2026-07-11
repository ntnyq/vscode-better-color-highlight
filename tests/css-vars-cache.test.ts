import { join } from 'node:path'
import { isString } from '@ntnyq/utils'
import { describe, expect, it, vi } from 'vitest'
import type * as CssVarSourcesModule from '../src/strategies/css-vars/sources'
import type * as WorkspaceFileSystem from '../src/utils/workspace-file-system'
import type { WorkspaceFindFilesPattern } from '../src/utils/workspace-file-system'

const fileStats = new Map<string, { mtimeMs: number; size: number }>()
const fileTexts = new Map<string, string>()
const directories = new Map<string, string[]>()
const globMatches = new Map<string, string[]>()
type WorkspaceFindFilesMockPattern = string | WorkspaceFindFilesPattern
const cssVarSourcesModulePath = '../src/strategies/css-vars/sources.ts'

const readFileMock = vi.fn<(filePath: unknown) => Promise<string>>(filePath => {
  const normalizedFilePath = String(filePath)
  const text = fileTexts.get(normalizedFilePath)
  if (text === undefined) {
    throw new Error(`Missing file: ${normalizedFilePath}`)
  }

  return Promise.resolve(text)
})
const statMock = vi.fn<
  (filePath: unknown) => Promise<{ mtimeMs: number; size: number }>
>(filePath => {
  const normalizedFilePath = String(filePath)
  const stats = fileStats.get(normalizedFilePath)
  if (!stats) {
    throw new Error(`Missing file: ${normalizedFilePath}`)
  }

  return Promise.resolve(stats)
})
const isDirectoryMock = vi.fn<(filePath: unknown) => Promise<boolean>>(
  filePath => Promise.resolve(directories.has(String(filePath))),
)
const findFilesMock = vi.fn<
  (pattern: WorkspaceFindFilesMockPattern) => Promise<string[]>
>(pattern =>
  Promise.resolve(globMatches.get(createGlobMatchKey(pattern)) ?? []),
)

vi.mock(
  import('../src/utils/workspace-file-system'),
  async importActual =>
    ({
      ...(await importActual()),
      findWorkspaceFiles: findFilesMock,
      readWorkspaceFile: readFileMock,
      statWorkspaceFile: statMock,
      workspacePathIsDirectory: isDirectoryMock,
    }) as unknown as Partial<typeof WorkspaceFileSystem>,
)

describe('css variable source cache', () => {
  it('loads declarations from configured external file paths', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()

    const dir = '/tmp/better-color-css-vars'
    const tokensPath = join(dir, 'tokens.css')
    setFile(tokensPath, ':root { --brand: #336699; }\n')

    const declarations = await loadCssVarSourceDeclarations({
      filePath: join(dir, 'entry.css'),
      paths: ['tokens.css'],
      trustedSelectors: [':root'],
    })

    expect(declarations).toMatchObject([
      {
        name: '--brand',
        value: '#336699',
        filePath: tokensPath,
        isTrusted: true,
      },
    ])
  })

  it('reuses cached file text until mtime or size changes', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()

    const dir = '/tmp/better-color-css-vars-cache'
    const tokensPath = join(dir, 'tokens.css')
    const options = {
      filePath: join(dir, 'entry.css'),
      paths: ['tokens.css'],
      trustedSelectors: [':root'],
    }

    setFile(tokensPath, ':root { --brand: #336699; }\n', 1)

    const first = await loadCssVarSourceDeclarations(options)
    const second = await loadCssVarSourceDeclarations(options)

    expect(first.map(declaration => declaration.value)).toStrictEqual([
      '#336699',
    ])
    expect(second).toStrictEqual(first)
    expect(readFileMock).toHaveBeenCalledTimes(1)

    setFile(tokensPath, ':root { --brand: #663399; }\n', 2)

    const third = await loadCssVarSourceDeclarations(options)

    expect(third.map(declaration => declaration.value)).toStrictEqual([
      '#663399',
    ])
    expect(readFileMock).toHaveBeenCalledTimes(2)
  })

  it('invalidates cached file text when only file size changes', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()

    const dir = '/tmp/better-color-css-vars-cache-size'
    const tokensPath = join(dir, 'tokens.css')
    const options = {
      filePath: join(dir, 'entry.css'),
      paths: ['tokens.css'],
      trustedSelectors: [':root'],
    }

    setFile(tokensPath, ':root { --brand: red; }\n', 1)

    const first = await loadCssVarSourceDeclarations(options)

    setFile(tokensPath, ':root { --brand: blue; }\n', 1)

    const second = await loadCssVarSourceDeclarations(options)

    expect(first.map(declaration => declaration.value)).toStrictEqual(['red'])
    expect(second.map(declaration => declaration.value)).toStrictEqual(['blue'])
    expect(readFileMock).toHaveBeenCalledTimes(2)
  })

  it('loads declarations from configured current-file-relative globs', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()

    const dir = '/tmp/better-color-css-vars-glob'
    const tokensPath = join(dir, 'tokens', 'colors.css')
    const themePath = join(dir, 'tokens', 'theme.scss')
    const ignoredPath = join(dir, 'tokens', 'notes.txt')
    const pattern = 'tokens/**/*.{css,scss,less}'

    globMatches.set(
      createGlobMatchKey({
        basePath: dir,
        pattern,
      }),
      [tokensPath, themePath, ignoredPath],
    )
    setFile(tokensPath, ':root { --brand: #336699; }\n')
    setFile(themePath, ':root { --accent: #663399; }\n')
    setFile(ignoredPath, ':root { --ignored: #ff0000; }\n')

    const declarations = await loadCssVarSourceDeclarations({
      filePath: join(dir, 'entry.css'),
      paths: [pattern],
      trustedSelectors: [':root'],
    })

    expect(findFilesMock).toHaveBeenCalledWith(
      {
        basePath: dir,
        pattern,
      },
      64,
    )
    expect(declarations.map(declaration => declaration.name)).toStrictEqual([
      '--brand',
      '--accent',
    ])
  })

  it('normalizes relative Windows glob separators before searching', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()

    const dir = '/tmp/better-color-css-vars-windows-relative-glob'
    const tokensPath = `${dir}/tokens/colors.css`

    globMatches.set(
      createGlobMatchKey({
        basePath: dir,
        pattern: 'tokens/**/*.css',
      }),
      [tokensPath],
    )
    setFile(tokensPath, ':root { --brand: #336699; }\n')

    const declarations = await loadCssVarSourceDeclarations({
      filePath: `${dir}/entry.css`,
      paths: [String.raw`tokens\**\*.css`],
      trustedSelectors: [':root'],
    })

    expect(findFilesMock).toHaveBeenCalledWith(
      {
        basePath: dir,
        pattern: 'tokens/**/*.css',
      },
      64,
    )
    expect(declarations.map(declaration => declaration.name)).toStrictEqual([
      '--brand',
    ])
  })

  it('normalizes absolute Windows glob separators before splitting', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()

    const entryPath = String.raw`C:\repo\src\entry.css`
    const tokensPath = String.raw`C:\repo\tokens\colors.css`

    globMatches.set(
      createGlobMatchKey({
        basePath: 'C:/repo/tokens',
        pattern: '**/*.css',
      }),
      [tokensPath],
    )
    setFile(tokensPath, ':root { --brand: #336699; }\n')

    const declarations = await loadCssVarSourceDeclarations({
      filePath: entryPath,
      paths: [String.raw`C:\repo\tokens\**\*.css`],
      trustedSelectors: [':root'],
    })

    expect(findFilesMock).toHaveBeenCalledWith(
      {
        basePath: 'C:/repo/tokens',
        pattern: '**/*.css',
      },
      64,
    )
    expect(declarations.map(declaration => declaration.name)).toStrictEqual([
      '--brand',
    ])
  })

  it('preserves URI glob prefixes while normalizing path separators', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()

    const basePath = 'vscode-remote://ssh-remote+host/home/me/tokens'
    const tokensPath = `${basePath}/colors.css`

    globMatches.set(
      createGlobMatchKey({
        basePath,
        pattern: '**/*.css',
      }),
      [tokensPath],
    )
    setFile(tokensPath, ':root { --brand: #336699; }\n')

    const declarations = await loadCssVarSourceDeclarations({
      filePath: 'vscode-remote://ssh-remote+host/home/me/src/entry.css',
      paths: [
        String.raw`vscode-remote://ssh-remote+host/home/me/tokens\**\*.css`,
      ],
      trustedSelectors: [':root'],
    })

    expect(findFilesMock).toHaveBeenCalledWith(
      {
        basePath,
        pattern: '**/*.css',
      },
      64,
    )
    expect(declarations.map(declaration => declaration.name)).toStrictEqual([
      '--brand',
    ])
  })

  it('recursively loads css-like files from configured directories', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()

    const dir = '/tmp/better-color-css-vars-dir'
    const tokensPath = join(dir, 'tokens.css')
    const themePath = join(dir, 'nested', 'theme.scss')
    const ignoredPath = join(dir, 'nested', 'notes.txt')

    directories.set(dir, [])
    globMatches.set(
      createGlobMatchKey({
        basePath: dir,
        pattern: '**/*.{css,scss,less}',
      }),
      [tokensPath, themePath, ignoredPath],
    )
    setFile(tokensPath, ':root { --brand: #336699; }\n')
    setFile(themePath, ':root { --accent: #663399; }\n')
    setFile(ignoredPath, ':root { --ignored: #ff0000; }\n')

    const declarations = await loadCssVarSourceDeclarations({
      filePath: join(dir, 'entry.css'),
      paths: [dir],
      trustedSelectors: [':root'],
    })

    expect(findFilesMock).toHaveBeenCalledWith(
      {
        basePath: dir,
        pattern: '**/*.{css,scss,less}',
      },
      64,
    )
    expect(declarations.map(declaration => declaration.name)).toStrictEqual([
      '--brand',
      '--accent',
    ])
  })

  it('skips unreadable external files', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()

    const dir = '/tmp/better-color-css-vars-unreadable'
    const readablePath = join(dir, 'readable.css')
    const unreadablePath = join(dir, 'unreadable.css')
    setFile(readablePath, ':root { --brand: #336699; }\n')
    fileStats.set(unreadablePath, { mtimeMs: 1, size: 24 })

    const declarations = await loadCssVarSourceDeclarations({
      filePath: join(dir, 'entry.css'),
      paths: ['unreadable.css', 'readable.css'],
      trustedSelectors: [':root'],
    })

    expect(declarations.map(declaration => declaration.name)).toStrictEqual([
      '--brand',
    ])
  })

  it('starts no dependency read after cancellation during a real source stat', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()
    let cancelled = false
    const deferred = Promise.withResolvers<{ mtimeMs: number; size: number }>()
    statMock.mockReturnValueOnce(deferred.promise)
    const promise = loadCssVarSourceDeclarations({
      filePath: '/tmp/entry.css',
      paths: ['tokens.css'],
      signal: {
        get isCancellationRequested() {
          return cancelled
        },
      },
      trustedSelectors: [':root'],
    })

    await vi.waitFor(() => expect(statMock).toHaveBeenCalledTimes(1))
    cancelled = true
    deferred.resolve({ mtimeMs: 1, size: 24 })

    await expect(promise).resolves.toStrictEqual([])
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it('shares a unique-read budget across cached source loads', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()
    const workspaceReadBudget = createTestBudget(2)
    const dir = '/tmp/better-color-css-vars-budget'
    for (const [name, color] of [
      ['one', '#111111'],
      ['two', '#222222'],
      ['three', '#333333'],
    ]) {
      setFile(join(dir, `${name}.css`), `:root { --${name}: ${color}; }\n`)
    }
    const options = {
      filePath: join(dir, 'entry.css'),
      paths: ['one.css', 'one.css', 'two.css', 'three.css'],
      trustedSelectors: [':root'],
      workspaceReadBudget,
    }

    const first = await loadCssVarSourceDeclarations(options)
    const second = await loadCssVarSourceDeclarations(options)

    expect(first.map(declaration => declaration.name)).toStrictEqual([
      '--one',
      '--two',
    ])
    expect(second).toStrictEqual(first)
    expect(readFileMock).toHaveBeenCalledTimes(2)
    expect(statMock.mock.calls.flat()).not.toContain(join(dir, 'three.css'))
  })

  it('claims configured paths before directory and file metadata probes', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()
    const dir = '/tmp/better-color-css-vars-probe-budget'
    const tokensPath = join(dir, 'tokens.css')
    setFile(tokensPath, ':root { --brand: #336699; }\n')

    const exhaustedBudget = createTestBudget(1)
    exhaustedBudget.tryClaim(join(dir, 'already-claimed.css'))
    await expect(
      loadCssVarSourceDeclarations({
        filePath: join(dir, 'entry.css'),
        paths: ['tokens.css'],
        trustedSelectors: [':root'],
        workspaceReadBudget: exhaustedBudget,
      }),
    ).resolves.toStrictEqual([])
    expect(isDirectoryMock).not.toHaveBeenCalled()
    expect(statMock).not.toHaveBeenCalled()
    expect(readFileMock).not.toHaveBeenCalled()

    const repeatedBudget = createTestBudget(1)
    repeatedBudget.tryClaim(tokensPath)
    await expect(
      loadCssVarSourceDeclarations({
        filePath: join(dir, 'entry.css'),
        paths: ['tokens.css'],
        trustedSelectors: [':root'],
        workspaceReadBudget: repeatedBudget,
      }),
    ).resolves.toMatchObject([{ name: '--brand' }])
    expect(isDirectoryMock).toHaveBeenCalledWith(tokensPath)
    expect(statMock).toHaveBeenCalledWith(tokensPath)
    expect(readFileMock).toHaveBeenCalledWith(tokensPath)
  })

  it('discovers configured directories and globs within the shared budget', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } = await importCssVarSources()
    const dir = '/tmp/better-color-css-vars-discovery-budget'
    const directoryPath = join(dir, 'tokens')
    const directoryFile = join(directoryPath, 'brand.css')
    const globFile = join(dir, 'shared', 'accent.scss')
    directories.set(directoryPath, [])
    globMatches.set(
      createGlobMatchKey({
        basePath: directoryPath,
        pattern: '**/*.{css,scss,less}',
      }),
      [directoryFile],
    )
    globMatches.set(
      createGlobMatchKey({ basePath: dir, pattern: 'shared/*.scss' }),
      [globFile],
    )
    setFile(directoryFile, ':root { --brand: #336699; }\n')
    setFile(globFile, ':root { --accent: #663399; }\n')

    const declarations = await loadCssVarSourceDeclarations({
      filePath: join(dir, 'entry.css'),
      paths: ['tokens', 'shared/*.scss'],
      trustedSelectors: [':root'],
      workspaceReadBudget: createTestBudget(3),
    })

    expect(declarations.map(declaration => declaration.name)).toStrictEqual([
      '--brand',
      '--accent',
    ])
  })
})

function importCssVarSources(): Promise<typeof CssVarSourcesModule> {
  return import(cssVarSourcesModulePath) as Promise<typeof CssVarSourcesModule>
}

function resetTestState() {
  fileStats.clear()
  fileTexts.clear()
  directories.clear()
  globMatches.clear()
  readFileMock.mockClear()
  statMock.mockClear()
  isDirectoryMock.mockClear()
  findFilesMock.mockClear()
  vi.resetModules()
}

function setFile(filePath: string, text: string, mtimeMs = 1) {
  fileTexts.set(filePath, text)
  fileStats.set(filePath, {
    mtimeMs,
    size: text.length,
  })
}

function createGlobMatchKey(pattern: WorkspaceFindFilesMockPattern): string {
  if (isString(pattern)) {
    return pattern
  }

  return `${pattern.basePath}\0${pattern.pattern}`
}

function createTestBudget(maximum: number) {
  const claimed = new Set<string>()
  return {
    tryClaim(identity: string) {
      if (claimed.has(identity)) {
        return true
      }
      if (claimed.size >= maximum) {
        return false
      }
      claimed.add(identity)
      return true
    },
  }
}
