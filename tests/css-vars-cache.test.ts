import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type * as WorkspaceFileSystem from '../src/utils/workspace-file-system'
import type { WorkspaceFindFilesPattern } from '../src/utils/workspace-file-system'

const fileStats = new Map<string, { mtimeMs: number; size: number }>()
const fileTexts = new Map<string, string>()
const directories = new Map<string, string[]>()
const globMatches = new Map<string, string[]>()
type WorkspaceFindFilesMockPattern = string | WorkspaceFindFilesPattern
const cssVarSourcesModulePath = '../src/strategies/css-var-sources.ts'

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
const readDirectoryMock = vi.fn<(filePath: unknown) => Promise<string[]>>(
  filePath => Promise.resolve(directories.get(String(filePath)) ?? []),
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
      readWorkspaceDirectory: readDirectoryMock,
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
    // oxlint-disable-next-line vitest/prefer-called-once
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
    expect(readDirectoryMock).not.toHaveBeenCalled()
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
})

async function importCssVarSources() {
  return import(cssVarSourcesModulePath) as Promise<
    typeof import('../src/strategies/css-var-sources')
  >
}

function resetTestState() {
  fileStats.clear()
  fileTexts.clear()
  directories.clear()
  globMatches.clear()
  readFileMock.mockClear()
  statMock.mockClear()
  isDirectoryMock.mockClear()
  readDirectoryMock.mockClear()
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
  if (typeof pattern === 'string') {
    return pattern
  }

  return `${pattern.basePath}\0${pattern.pattern}`
}
