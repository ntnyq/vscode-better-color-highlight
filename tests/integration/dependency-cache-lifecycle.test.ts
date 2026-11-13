import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { ColorDetector, StrategyContext } from '../../src/engine/detection'
import { findCssVars } from '../../src/engine/strategies/css-vars'
import { findJsonDesignTokens } from '../../src/engine/strategies/design-tokens/json-strategy'
import { findScssVars } from '../../src/engine/strategies/scss-vars'
import { findTailwindThemeColors } from '../../src/engine/strategies/tailwind-theme'

const filesystem = vi.hoisted(() => ({
  toUri: (value: string) => {
    const url = new URL(value.startsWith('file:') ? value : `file://${value}`)
    return { fsPath: url.pathname, toString: () => url.href }
  },
  files: new Map<string, string>(),
  documents: [] as {
    uri: { toString: () => string }
    version: number
    getText: () => string
  }[],
}))

vi.mock(
  import('vscode'),
  () =>
    ({
      FileType: { File: 1, Directory: 2 },
      Uri: { file: filesystem.toUri, parse: filesystem.toUri },
      workspace: {
        textDocuments: filesystem.documents,
        fs: {
          stat: (uri: { fsPath: string }) => {
            const text = filesystem.files.get(uri.fsPath)
            if (text === undefined) {
              throw new Error('missing file')
            }
            return Promise.resolve({ type: 1, mtime: 1, size: text.length })
          },
          readFile: (uri: { fsPath: string }) =>
            Promise.resolve(
              new TextEncoder().encode(filesystem.files.get(uri.fsPath)),
            ),
        },
      },
    }) as unknown as Partial<typeof Vscode>,
)

interface DependencyFixture {
  readonly name: string
  readonly detector: ColorDetector
  readonly path: string
  readonly source: string
  readonly dependency: (color: string) => string
  readonly context: StrategyContext
}

const fixtures: DependencyFixture[] = [
  {
    name: 'CSS variables',
    detector: findCssVars,
    path: '/repo/theme.css',
    source: '.a { color: var(--brand); }',
    dependency: color => `:root { --brand: ${color}; }`,
    context: {
      languageId: 'css',
      filePath: 'file:///repo/main.css',
      resolveCssVariablesAcrossFiles: true,
      cssVariablePaths: ['./theme.css'],
    },
  },
  {
    name: 'SCSS modules',
    detector: findScssVars,
    path: '/repo/_theme.scss',
    source: '@use "./theme"; .a { color: theme.$brand; }',
    dependency: color => `$brand: ${color};`,
    context: {
      languageId: 'scss',
      filePath: 'file:///repo/main.scss',
      resolveScssVariablesAcrossFiles: true,
    },
  },
  {
    name: 'Tailwind themes',
    detector: findTailwindThemeColors,
    path: '/repo/tailwind.css',
    source: '<div class="bg-brand"></div>',
    dependency: color => `@theme { --color-brand: ${color}; }`,
    context: {
      languageId: 'html',
      filePath: 'file:///repo/main.html',
      tailwindColorMode: 'v4',
      tailwindStylesheetPaths: ['./tailwind.css'],
    },
  },
  {
    name: 'design tokens',
    detector: findJsonDesignTokens,
    path: '/repo/theme.json',
    source: '{"brand":{"$type":"color","$ref":"./theme.json#/brand/$value"}}',
    dependency: color =>
      JSON.stringify({
        brand: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 3, 5].map(
              index => Number.parseInt(color.slice(index, index + 2), 16) / 255,
            ),
          },
        },
      }),
    context: {
      languageId: 'json',
      filePath: 'file:///repo/main.json',
      resolveDesignTokensAcrossFiles: true,
    },
  },
]

describe('dependency cache document lifetimes', () => {
  beforeEach(() => {
    filesystem.files.clear()
    filesystem.documents.length = 0
  })

  it.each(fixtures)(
    'refreshes $name after reopening with the same version and size',
    async ({ detector, path, source, dependency, context }) => {
      filesystem.files.set(path, dependency('#ff0000'))
      const open = (color: string) => {
        filesystem.documents.splice(0, filesystem.documents.length, {
          uri: { toString: () => `file://${path}` },
          version: 2,
          getText: () => dependency(color),
        })
      }
      const colors = async () => {
        const matches = await detector(source, {
          ...context,
          workspaceIsTrusted: true,
        })
        return matches.map(match => match.color)
      }

      open('#00ff00')
      await expect(colors()).resolves.toContain('rgb(0, 255, 0)')
      await expect(colors()).resolves.toContain('rgb(0, 255, 0)')
      open('#0000ff')
      await expect(colors()).resolves.toContain('rgb(0, 0, 255)')
      filesystem.documents.length = 0
      await expect(colors()).resolves.toContain('rgb(255, 0, 0)')
    },
  )
})
