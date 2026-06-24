import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type * as WorkspaceFileSystem from '../src/utils/workspace-file-system'

const fileStats = new Map<string, { mtimeMs: number; size: number }>()
const fileTexts = new Map<string, string>()
const directories = new Map<string, string[]>()
const globMatches = new Map<string, string[]>()

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
const findFilesMock = vi.fn<(pattern: string) => Promise<string[]>>(pattern =>
  Promise.resolve(globMatches.get(pattern) ?? []),
)

vi.mock(
  import('../src/utils/workspace-file-system'),
  () =>
    ({
      basenameWorkspacePath: basename,
      dirnameWorkspacePath: dirname,
      extnameWorkspacePath: extname,
      findWorkspaceFiles: findFilesMock,
      isAbsoluteWorkspacePath: isAbsolute,
      joinWorkspacePath: join,
      readWorkspaceDirectory: readDirectoryMock,
      readWorkspaceFile: readFileMock,
      resolveWorkspacePath: (baseFilePath: string, value: string) =>
        isAbsolute(value) ? value : resolve(dirname(baseFilePath), value),
      statWorkspaceFile: statMock,
      workspacePathIsDirectory: isDirectoryMock,
    }) as unknown as Partial<typeof WorkspaceFileSystem>,
)

describe('css variable source cache', () => {
  it('loads declarations from configured external file paths', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } =
      await import('../src/strategies/css-var-sources')

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
    const { loadCssVarSourceDeclarations } =
      await import('../src/strategies/css-var-sources')

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

  it('recursively loads css-like files from configured directories', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } =
      await import('../src/strategies/css-var-sources')

    const dir = '/tmp/better-color-css-vars-dir'
    const nestedDir = join(dir, 'nested')
    const tokensPath = join(dir, 'tokens.css')
    const themePath = join(nestedDir, 'theme.scss')
    const ignoredPath = join(nestedDir, 'notes.txt')

    directories.set(dir, [tokensPath, nestedDir])
    directories.set(nestedDir, [themePath, ignoredPath])
    setFile(tokensPath, ':root { --brand: #336699; }\n')
    setFile(themePath, ':root { --accent: #663399; }\n')
    setFile(ignoredPath, ':root { --ignored: #ff0000; }\n')

    const declarations = await loadCssVarSourceDeclarations({
      filePath: join(dir, 'entry.css'),
      paths: [dir],
      trustedSelectors: [':root'],
    })

    expect(declarations.map(declaration => declaration.name)).toStrictEqual([
      '--brand',
      '--accent',
    ])
  })

  it('skips unreadable external files', async () => {
    resetTestState()
    const { loadCssVarSourceDeclarations } =
      await import('../src/strategies/css-var-sources')

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
