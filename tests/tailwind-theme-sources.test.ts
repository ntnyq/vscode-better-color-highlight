import { isString } from '@ntnyq/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTailwindTheme } from '../src/strategies/tailwind-theme/resolver'
import type * as Sources from '../src/strategies/tailwind-theme/sources'
import type * as WorkspaceFileSystem from '../src/utils/workspace-file-system'
import type { WorkspaceFindFilesPattern } from '../src/utils/workspace-file-system'

interface TestStat {
  documentVersion?: number
  mtimeMs: number
  size: number
}

const texts = new Map<string, string>()
const stats = new Map<string, TestStat>()
const directories = new Set<string>()
const matches = new Map<string, string[]>()
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
const isDirectory = vi.fn<(path: string) => Promise<boolean>>(path =>
  Promise.resolve(directories.has(path)),
)
const findFiles = vi.fn<
  (
    pattern: string | WorkspaceFindFilesPattern,
    limit?: number,
  ) => Promise<string[]>
>((pattern, limit) =>
  Promise.resolve((matches.get(key(pattern)) ?? []).slice(0, limit)),
)

vi.mock(
  import('../src/utils/workspace-file-system'),
  async importActual =>
    ({
      ...(await importActual()),
      findWorkspaceFiles: findFiles,
      readWorkspaceFile: readFile,
      statWorkspaceFile: statFile,
      workspacePathIsDirectory: isDirectory,
    }) as unknown as Partial<typeof WorkspaceFileSystem>,
)

describe('loadTailwindThemeSources', () => {
  beforeEach(() => {
    texts.clear()
    stats.clear()
    directories.clear()
    matches.clear()
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('keeps cross-file loading disabled for empty paths and untrusted workspaces', async () => {
    const { loadTailwindThemeSources } = await importSources()
    setFile('/repo/theme.css', '@theme { --color-brand: red; }')

    const disabled = await loadTailwindThemeSources('@theme {}', {
      filePath: '/repo/page.html',
      languageId: 'html',
      tailwindStylesheetPaths: [],
      workspaceIsTrusted: true,
    })
    const untrusted = await loadTailwindThemeSources('@theme {}', {
      filePath: '/repo/page.html',
      languageId: 'html',
      tailwindStylesheetPaths: ['theme.css'],
      workspaceIsTrusted: false,
    })

    expect(disabled).toHaveLength(1)
    expect(untrusted).toHaveLength(1)
    expect(readFile).not.toHaveBeenCalled()
  })

  it('expands CSS files, directories, and globs in configured source order', async () => {
    const { loadTailwindThemeSources } = await importSources()
    const direct = '/repo/direct.css'
    const directory = '/repo/themes'
    const nested = '/repo/themes/nested.css'
    const globbed = '/repo/shared/colors.css'
    directories.add(directory)
    matches.set(key({ basePath: directory, pattern: '**/*.css' }), [nested])
    matches.set(key({ basePath: '/repo', pattern: 'shared/*.css' }), [globbed])
    setFile(direct, '@theme { --color-direct: red; }')
    setFile(nested, '@theme { --color-nested: blue; }')
    setFile(globbed, '@theme { --color-globbed: green; }')

    const result = await loadTailwindThemeSources('', {
      filePath: '/repo/page.html',
      languageId: 'html',
      tailwindStylesheetPaths: ['direct.css', 'themes', 'shared/*.css'],
      workspaceIsTrusted: true,
    })

    expect(result.map(source => source.filePath)).toStrictEqual([
      direct,
      nested,
      globbed,
      '/repo/page.html',
    ])
  })

  it('follows relative CSS imports and references, detects tailwindcss, and rejects unsafe specifiers', async () => {
    const { loadTailwindThemeSources } = await importSources()
    setFile(
      '/repo/theme.css',
      [
        '@import "./colors.css";',
        "@reference url('./reference.css');",
        '@import "tailwindcss";',
        '@import "/absolute.css";',
        '@import "https://example.com/theme.css";',
        '@reference "data:text/css,body{}";',
        '@import "package/theme.css";',
      ].join('\n'),
    )
    setFile('/repo/colors.css', '@theme { --color-one: red; }')
    setFile('/repo/reference.css', '@theme { --color-two: blue; }')

    const result = await loadTailwindThemeSources('', {
      filePath: '/repo/page.html',
      languageId: 'html',
      tailwindStylesheetPaths: ['theme.css'],
      workspaceIsTrusted: true,
    })

    expect(result.map(source => source.filePath)).toStrictEqual([
      '/repo/colors.css',
      '/repo/reference.css',
      '/repo/theme.css',
      '/repo/page.html',
    ])
    expect(result[2].hasV4Signal).toBe(true)
    expect(readFile.mock.calls.flat()).not.toContain('/absolute.css')
  })

  it.each([
    ['css', 'css'],
    ['scss', 'scss'],
    ['sass', 'sass'],
    ['less', 'less'],
    ['styl', 'styl'],
    ['stylus', 'styl'],
  ])(
    'follows dependencies from current unsaved %s documents before configured sources',
    async (languageId, extension) => {
      const { loadTailwindThemeSources } = await importSources()
      setFile('/repo/imported.css', '@theme { --color-imported: blue; }')
      setFile('/repo/configured.css', '@theme { --color-configured: green; }')

      const result = await loadTailwindThemeSources(
        '@import "./imported.css"; @theme { --color-current: red; }',
        {
          filePath: `/repo/current.${extension}`,
          languageId,
          tailwindStylesheetPaths: ['configured.css'],
          workspaceIsTrusted: true,
        },
      )

      expect(result.map(source => source.filePath)).toStrictEqual([
        '/repo/imported.css',
        '/repo/configured.css',
        `/repo/current.${extension}`,
      ])
      expect(result[2].themeDeclarations[0].name).toBe('--color-current')
    },
  )

  it.each([
    ['html', 'html'],
    ['htm', 'html'],
    ['vue', 'vue'],
    ['svelte', 'svelte'],
    ['astro', 'astro'],
  ])(
    'loads embedded-style directives for trusted configured .%s documents',
    async (extension, languageId) => {
      const { findTailwindThemeColors } =
        await import('../src/strategies/tailwind-theme-colors')
      const { resolveTailwindColorDefinition } =
        await import('../src/strategies/tailwind-theme/definition')
      const filePath = `/repo/page.${extension}`
      const importedPath = '/repo/imported.css'
      const referencedPath = '/repo/referenced.css'
      const importedText = '@theme { --color-imported: #112233; }'
      const referencedText = '@theme { --color-brand: #abcdef; }'
      setFile(importedPath, importedText)
      setFile(referencedPath, referencedText)
      setFile('/repo/configured.css', '@theme { --color-fallback: red; }')
      const text = `<script>
        const decoy = '<style>@reference "./decoy.css"; @theme { --color-brand: red; }</style>'
      </script>
      <style>
        @import "./imported.css";
        @reference "./referenced.css";
      </style>
      <div class="bg-brand"></div>`
      const context = {
        filePath,
        languageId,
        tailwindColorMode: 'v4' as const,
        tailwindStylesheetPaths: ['configured.css'],
        workspaceIsTrusted: true,
      }

      await expect(
        findTailwindThemeColors(text, context),
      ).resolves.toContainEqual({
        start: text.indexOf('bg-brand'),
        end: text.indexOf('bg-brand') + 'bg-brand'.length,
        color: 'rgb(171, 205, 239)',
      })
      await expect(
        resolveTailwindColorDefinition(
          text,
          text.indexOf('bg-brand') + 3,
          context,
        ),
      ).resolves.toStrictEqual({
        originRange: {
          start: text.indexOf('bg-brand'),
          end: text.indexOf('bg-brand') + 'bg-brand'.length,
        },
        targetFilePath: referencedPath,
        targetRange: {
          start: referencedText.indexOf('--color-brand'),
          end: referencedText.indexOf('#abcdef') + '#abcdef'.length,
        },
        targetSelectionRange: {
          start: referencedText.indexOf('--color-brand'),
          end: referencedText.indexOf('--color-brand') + '--color-brand'.length,
        },
      })
      expect(readFile.mock.calls.flat()).not.toContain('/repo/decoy.css')
    },
  )

  it('gives current unsaved declarations precedence over imported and configured fallbacks', async () => {
    const { loadTailwindThemeSources } = await importSources()
    setFile('/repo/imported.css', '@theme { --color-brand: #111111; }')
    setFile('/repo/configured.css', '@theme { --color-brand: #222222; }')
    const currentText =
      '@import "./imported.css"; @theme { --color-brand: #333333; }'

    const sources = await loadTailwindThemeSources(currentText, {
      filePath: '/repo/current.css',
      languageId: 'css',
      tailwindColorMode: 'v3',
      tailwindStylesheetPaths: ['configured.css'],
      workspaceIsTrusted: true,
    })
    const theme = await resolveTailwindTheme(sources, { mode: 'v3' })
    const brand = theme.colors.get('brand')

    expect(brand).toStrictEqual({
      source: {
        filePath: '/repo/current.css',
        range: {
          start: currentText.indexOf('--color-brand'),
          end: currentText.indexOf(';', currentText.indexOf('--color-brand')),
        },
        value: '#333333',
        valueRange: {
          start: currentText.indexOf('#333333'),
          end: currentText.indexOf('#333333') + '#333333'.length,
        },
      },
      value: 'rgb(51, 51, 51)',
    })
  })

  it('traverses unsaved dependencies when the configured root is the current stylesheet', async () => {
    const { loadTailwindThemeSources } = await importSources()
    setFile('/repo/dependency.css', '@theme { --color-dependency: blue; }')

    const result = await loadTailwindThemeSources(
      '@reference "./dependency.css"; @theme { --color-current: red; }',
      {
        filePath: '/repo/current.css',
        languageId: 'css',
        tailwindStylesheetPaths: ['/repo/current.css'],
        workspaceIsTrusted: true,
      },
    )

    expect(result.map(source => source.filePath)).toStrictEqual([
      '/repo/dependency.css',
      '/repo/current.css',
    ])
    expect(readFile.mock.calls.flat()).not.toContain('/repo/current.css')
  })

  it('deduplicates file URI and fsPath identities without changing source order', async () => {
    const { loadTailwindThemeSources } = await importSources()
    setFile(
      'file:///repo/shared.css',
      '@reference "./current.css"; @theme { --color-shared: blue; }',
    )

    const result = await loadTailwindThemeSources(
      '@import "./shared.css"; @theme { --color-current: red; }',
      {
        filePath: 'file:///repo/current.css',
        languageId: 'css',
        tailwindStylesheetPaths: ['/repo/current.css', '/repo/shared.css'],
        workspaceIsTrusted: true,
      },
    )

    expect(result.map(source => source.filePath)).toStrictEqual([
      'file:///repo/shared.css',
      'file:///repo/current.css',
    ])
    expect(readFile).toHaveBeenCalledTimes(1)
  })

  it('isolates unreadable and oversized sources and stops cycles', async () => {
    const { loadTailwindThemeSources } = await importSources()
    setFile('/repo/a.css', '@import "./b.css";')
    setFile('/repo/b.css', '@import "./a.css"; @theme {}')
    stats.set('/repo/large.css', { mtimeMs: 1, size: 512 * 1024 + 1 })
    stats.set('/repo/unreadable.css', { mtimeMs: 1, size: 20 })

    const result = await loadTailwindThemeSources('', {
      filePath: '/repo/page.html',
      languageId: 'html',
      tailwindStylesheetPaths: ['unreadable.css', 'a.css', 'large.css'],
      workspaceIsTrusted: true,
    })

    expect(result.map(source => source.filePath)).toStrictEqual([
      '/repo/b.css',
      '/repo/a.css',
      '/repo/page.html',
    ])
    expect(readFile).toHaveBeenCalledTimes(3)
  })

  it('enforces one 32-file request budget and import depth five', async () => {
    const { loadTailwindThemeSources } = await importSources()
    const configured = Array.from({ length: 40 }, (_, index) => `f${index}.css`)
    for (let index = 0; index < 40; index++) {
      setFile(`/repo/f${index}.css`, '@theme {}')
    }
    for (let depth = 0; depth <= 6; depth++) {
      setFile(
        `/depth/d${depth}.css`,
        `@import "./d${depth + 1}.css"; @theme {}`,
      )
    }

    const bounded = await loadTailwindThemeSources('', {
      filePath: '/repo/page.html',
      languageId: 'html',
      tailwindStylesheetPaths: configured,
      workspaceIsTrusted: true,
    })
    const depthBounded = await loadTailwindThemeSources('', {
      filePath: '/depth/page.html',
      languageId: 'html',
      tailwindStylesheetPaths: ['d0.css'],
      workspaceIsTrusted: true,
    })

    expect(bounded.slice(0, -1)).toHaveLength(32)
    expect(
      depthBounded.slice(0, -1).map(source => source.filePath),
    ).toStrictEqual(
      Array.from({ length: 6 }, (_, index) => `/depth/d${5 - index}.css`),
    )
  })

  it('uses current unsaved text and invalidates cache by version, mtime, or size', async () => {
    const { loadTailwindThemeSources } = await importSources()
    const options = {
      filePath: '/repo/page.html',
      languageId: 'html',
      tailwindStylesheetPaths: ['theme.css'],
      workspaceIsTrusted: true,
    } as const
    setFile('/repo/theme.css', '@theme { --color-brand: red; }', 1, 1)

    const first = await loadTailwindThemeSources(
      '@theme { --color-live: red; }',
      options,
    )
    await loadTailwindThemeSources('', options)
    setFile('/repo/theme.css', '@theme { --color-brand: blue; }', 1, 2)
    await loadTailwindThemeSources('', options)
    setFile('/repo/theme.css', '@theme { --color-brand: green; } ', 1, 2)
    const last = await loadTailwindThemeSources('', options)

    expect(first.at(-1)?.themeDeclarations[0].name).toBe('--color-live')
    expect(readFile).toHaveBeenCalledTimes(3)
    expect(last[0].themeDeclarations[0].value).toBe('green')
  })

  it('invalidates cached text when only mtime changes', async () => {
    const { loadTailwindThemeSources } = await importSources()
    const options = {
      filePath: '/repo/page.html',
      languageId: 'html',
      tailwindStylesheetPaths: ['theme.css'],
      workspaceIsTrusted: true,
    } as const
    setFile('/repo/theme.css', '@theme { --color-brand: red; }', 1)

    await loadTailwindThemeSources('', options)
    setFile('/repo/theme.css', '@theme { --color-brand: tan; }', 2)
    const result = await loadTailwindThemeSources('', options)

    expect(readFile).toHaveBeenCalledTimes(2)
    expect(result[0].themeDeclarations[0].value).toBe('tan')
  })
})

function importSources(): Promise<typeof Sources> {
  return import('../src/strategies/tailwind-theme/sources')
}

function setFile(
  path: string,
  text: string,
  mtimeMs = 1,
  documentVersion?: number,
) {
  texts.set(path, text)
  stats.set(path, { documentVersion, mtimeMs, size: text.length })
}

function key(pattern: string | WorkspaceFindFilesPattern): string {
  return isString(pattern) ? pattern : `${pattern.basePath}\0${pattern.pattern}`
}
