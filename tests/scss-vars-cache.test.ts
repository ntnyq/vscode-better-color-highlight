import type * as FsPromises from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

const fileStats = new Map<string, { mtimeMs: number; size: number }>()
const fileTexts = new Map<string, string>()

const accessMock = vi.fn<(filePath: unknown) => Promise<void>>(filePath => {
  const normalizedFilePath = String(filePath)
  if (!fileTexts.has(normalizedFilePath)) {
    throw new Error(`Missing file: ${normalizedFilePath}`)
  }
  return Promise.resolve()
})
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
  import('node:fs/promises'),
  () =>
    ({
      access: accessMock,
      readFile: readFileMock,
      stat: statMock,
    }) as unknown as Partial<typeof FsPromises>,
)

describe('scss variable dependency cache', () => {
  it('reuses unchanged dependency contents and invalidates when metadata changes', async () => {
    fileStats.clear()
    fileTexts.clear()
    accessMock.mockClear()
    readFileMock.mockClear()
    statMock.mockClear()
    vi.resetModules()

    const { join } = await import('node:path')
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
    // oxlint-disable-next-line vitest/prefer-called-once
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
})
