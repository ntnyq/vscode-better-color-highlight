import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as WorkspaceFileSystem from '../src/utils/workspace-file-system'

interface TestStat {
  documentVersion?: number
  mtimeMs: number
  size: number
}

const texts = new Map<string, string>()
const stats = new Map<string, TestStat>()
const readFile = vi.fn<(path: string) => Promise<string>>(path => {
  const text = texts.get(path)
  if (text === undefined) {
    throw new Error(`Unreadable: ${path}`)
  }
  return Promise.resolve(text)
})
const statFile = vi.fn<(path: string) => Promise<TestStat>>(path => {
  const stat = stats.get(path)
  if (!stat) {
    throw new Error(`Missing: ${path}`)
  }
  return Promise.resolve(stat)
})
const isDirectory = vi.fn<(path: string) => Promise<boolean>>(() =>
  Promise.resolve(false),
)

vi.mock(
  import('../src/utils/workspace-file-system'),
  async importActual =>
    ({
      ...(await importActual()),
      readWorkspaceFile: readFile,
      statWorkspaceFile: statFile,
      workspacePathIsDirectory: isDirectory,
    }) as unknown as Partial<typeof WorkspaceFileSystem>,
)

const baseContext = {
  filePath: '/repo/page.html',
  languageId: 'html',
  tailwindColorMode: 'v4' as const,
  tailwindStylesheetPaths: ['theme.css'],
  workspaceIsTrusted: true,
}

function setFile(path: string, text: string) {
  texts.set(path, text)
  stats.set(path, { mtimeMs: 1, size: text.length })
}

function rangeOf(text: string, value: string) {
  const start = text.indexOf(value)
  return { start, end: start + value.length }
}

describe('tailwind definition source loading', () => {
  beforeEach(() => {
    texts.clear()
    stats.clear()
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('navigates real import and reference targets and rejects unsafe dependencies', async () => {
    const colors = '@theme { --color-imported: #112233; }'
    const reference = '@theme { --color-referenced: #445566; }'
    setFile(
      '/repo/theme.css',
      [
        '@import "./colors.css";',
        '@reference "./reference.css";',
        '@import "package/theme.css";',
        '@reference "https://example.com/theme.css";',
        '@import "/absolute.css";',
        '@reference "data:text/css,body{}";',
      ].join('\n'),
    )
    setFile('/repo/colors.css', colors)
    setFile('/repo/reference.css', reference)
    const text = '<div class="bg-imported text-referenced"></div>'
    const { resolveTailwindColorDefinition } =
      await import('../src/strategies/tailwind-theme/definition')

    await expect(
      resolveTailwindColorDefinition(
        text,
        text.indexOf('imported'),
        baseContext,
      ),
    ).resolves.toMatchObject({
      targetFilePath: '/repo/colors.css',
      targetRange: {
        start: rangeOf(colors, '--color-imported').start,
        end: rangeOf(colors, '#112233').end,
      },
      targetSelectionRange: rangeOf(colors, '--color-imported'),
    })
    await expect(
      resolveTailwindColorDefinition(
        text,
        text.indexOf('referenced'),
        baseContext,
      ),
    ).resolves.toMatchObject({
      targetFilePath: '/repo/reference.css',
      targetSelectionRange: rangeOf(reference, '--color-referenced'),
    })
    const reads = readFile.mock.calls.flat()
    expect(reads).toContain('/repo/theme.css')
    expect(reads).toContain('/repo/colors.css')
    expect(reads).toContain('/repo/reference.css')
    expect(reads).not.toContain('/repo/package/theme.css')
    expect(reads).not.toContain('https://example.com/theme.css')
    expect(reads).not.toContain('/absolute.css')
  })

  it('loads configured paths only in trusted workspaces', async () => {
    setFile('/repo/theme.css', '@theme { --color-brand: #123456; }')
    const text = '<div class="bg-brand"></div>'
    const { resolveTailwindColorDefinition } =
      await import('../src/strategies/tailwind-theme/definition')

    await expect(
      resolveTailwindColorDefinition(text, text.indexOf('brand'), baseContext),
    ).resolves.toMatchObject({ targetFilePath: '/repo/theme.css' })

    readFile.mockClear()
    await expect(
      resolveTailwindColorDefinition(text, text.indexOf('brand'), {
        ...baseContext,
        workspaceIsTrusted: false,
      }),
    ).resolves.toBeNull()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('does not read configured paths when the cursor is off-token', async () => {
    setFile('/repo/theme.css', '@theme { --color-brand: #123456; }')
    const text = '<div class="bg-brand">plain text</div>'
    const { resolveTailwindColorDefinition } =
      await import('../src/strategies/tailwind-theme/definition')

    await expect(
      resolveTailwindColorDefinition(text, text.indexOf('plain'), baseContext),
    ).resolves.toBeNull()
    expect(statFile).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
  })

  it.each(['--color-*', '--*'])(
    'honors %s namespace resets during navigation',
    async reset => {
      setFile('/repo/palette.css', '@theme { --color-old: red; }')
      setFile(
        '/repo/theme.css',
        `@import "./palette.css"; @theme { ${reset}: initial; --color-final: blue; }`,
      )
      const text = '<div class="bg-old bg-final"></div>'
      const { resolveTailwindColorDefinition } =
        await import('../src/strategies/tailwind-theme/definition')

      await expect(
        resolveTailwindColorDefinition(text, text.indexOf('old'), baseContext),
      ).resolves.toBeNull()
      await expect(
        resolveTailwindColorDefinition(
          text,
          text.indexOf('final'),
          baseContext,
        ),
      ).resolves.toMatchObject({ targetFilePath: '/repo/theme.css' })
    },
  )

  it('preserves the final target through a true cross-file alias chain', async () => {
    const colors = '@theme { --color-base: #abcdef; }'
    setFile('/repo/colors.css', colors)
    setFile(
      '/repo/aliases.css',
      '@import "./colors.css"; @theme { --color-mid: var(--color-base); }',
    )
    setFile(
      '/repo/theme.css',
      '@import "./aliases.css"; @theme { --color-brand: var(--color-mid); }',
    )
    const text = '<div class="hover:bg-brand/50"></div>'
    const { resolveTailwindColorDefinition } =
      await import('../src/strategies/tailwind-theme/definition')

    await expect(
      resolveTailwindColorDefinition(text, text.indexOf('brand'), baseContext),
    ).resolves.toStrictEqual({
      originRange: rangeOf(text, 'hover:bg-brand/50'),
      targetFilePath: '/repo/colors.css',
      targetRange: {
        start: rangeOf(colors, '--color-base').start,
        end: rangeOf(colors, '#abcdef').end,
      },
      targetSelectionRange: rangeOf(colors, '--color-base'),
    })
  })
})
