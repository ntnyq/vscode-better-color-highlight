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

const existsMock = vi.fn<(filePath: string) => Promise<boolean>>(filePath =>
  Promise.resolve(fileTexts.has(filePath)),
)
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

vi.mock(
  import('../src/utils/workspace-file-system'),
  () =>
    ({
      basenameWorkspacePath: basename,
      dirnameWorkspacePath: dirname,
      extnameWorkspacePath: extname,
      isAbsoluteWorkspacePath: isAbsolute,
      joinWorkspacePath: join,
      readWorkspaceFile: readFileMock,
      resolveWorkspacePath: (baseFilePath: string, value: string) =>
        isAbsolute(value) ? value : resolve(dirname(baseFilePath), value),
      statWorkspaceFile: statMock,
      workspacePathExists: existsMock,
    }) as unknown as Partial<typeof WorkspaceFileSystem>,
)

describe('scss variable dependency cache', () => {
  it('reuses unchanged dependency contents and invalidates when metadata changes', async () => {
    fileStats.clear()
    fileTexts.clear()
    existsMock.mockClear()
    existsMock.mockImplementation(filePath =>
      Promise.resolve(fileTexts.has(filePath)),
    )
    readFileMock.mockClear()
    statMock.mockClear()
    vi.resetModules()

    const { findScssVars } = await import('../src/strategies/scss-vars')

    const dir = '/tmp/better-color-scss-cache'
    const tokensPath = join(dir, '_tokens.scss')
    const entryPath = join(dir, 'entry.scss')
    const text = '@use "tokens";\n.button { color: tokens.$brand; }\n'

    fileTexts.set(tokensPath, '$brand: #336699;\n')
    fileStats.set(tokensPath, {
      mtimeMs: 1,
      size: fileTexts.get(tokensPath)!.length,
    })

    const context = {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    }

    const first = await findScssVars(text, context)
    const second = await findScssVars(text, context)

    expect(first).toStrictEqual([
      {
        start: text.indexOf('tokens.$brand'),
        end: text.indexOf('tokens.$brand') + 'tokens.$brand'.length,
        color: 'rgb(51, 102, 153)',
      },
    ])
    expect(second).toStrictEqual(first)
    expect(readFileMock).toHaveBeenCalledTimes(1)

    fileTexts.set(tokensPath, '$brand: #663399;\n')
    fileStats.set(tokensPath, {
      mtimeMs: 2,
      size: fileTexts.get(tokensPath)!.length,
    })

    const third = await findScssVars(text, context)

    expect(third).toStrictEqual([
      {
        start: text.indexOf('tokens.$brand'),
        end: text.indexOf('tokens.$brand') + 'tokens.$brand'.length,
        color: 'rgb(102, 51, 153)',
      },
    ])
    expect(readFileMock).toHaveBeenCalledTimes(2)
  })

  it('skips unreadable dependency files without failing the run', async () => {
    fileStats.clear()
    fileTexts.clear()
    existsMock.mockClear()
    readFileMock.mockClear()
    statMock.mockClear()
    vi.resetModules()

    const { findScssVars } = await import('../src/strategies/scss-vars')

    const dir = '/tmp/better-color-scss-unreadable'
    const tokensPath = join(dir, '_tokens.scss')
    const entryPath = join(dir, 'entry.scss')
    const text = '@use "tokens";\n.button { color: tokens.$brand; }\n'

    existsMock.mockImplementation(filePath =>
      Promise.resolve(String(filePath) === tokensPath),
    )
    fileStats.set(tokensPath, {
      mtimeMs: 1,
      size: 24,
    })

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([])
    expect(readFileMock).toHaveBeenCalledTimes(1)
  })

  it('skips dependency files that exceed the size cap', async () => {
    fileStats.clear()
    fileTexts.clear()
    existsMock.mockClear()
    existsMock.mockImplementation(filePath =>
      Promise.resolve(fileTexts.has(filePath)),
    )
    readFileMock.mockClear()
    statMock.mockClear()
    vi.resetModules()

    const { findScssVars } = await import('../src/strategies/scss-vars')

    const dir = '/tmp/better-color-scss-large'
    const tokensPath = join(dir, '_tokens.scss')
    const entryPath = join(dir, 'entry.scss')
    const text = '@use "tokens";\n.button { color: tokens.$brand; }\n'

    fileTexts.set(tokensPath, '$brand: #336699;\n')
    fileStats.set(tokensPath, {
      mtimeMs: 1,
      size: 512 * 1024 + 1,
    })

    const result = await findScssVars(text, {
      languageId: 'scss',
      filePath: entryPath,
      resolveScssVariablesAcrossFiles: true,
    })

    expect(result).toStrictEqual([])
    expect(readFileMock).not.toHaveBeenCalled()
  })
})
