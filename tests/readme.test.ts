import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { scopedConfigs } from '../src/meta'

describe('readme generated config documentation', () => {
  it('contributes the workspace palette and contrast commands', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      contributes: {
        commands: { command: string; title: string }[]
      }
    }

    expect(packageJson.contributes.commands).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: 'color-highlight.showWorkspacePalette',
          title: 'Show Workspace Palette',
        }),
        expect.objectContaining({
          command: 'color-highlight.checkColorContrast',
          title: 'Check Color Contrast',
        }),
      ]),
    )
  })

  it('preserves wildcard asterisks in language configuration defaults', async () => {
    const readme = await readFile('README.md', 'utf8')

    expect(readme).toContain('`["*"]`')
    expect(readme).not.toContain('`["_"]`')
  })

  it('documents the opt-in native color picker setting', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      contributes: {
        configuration: {
          properties: Record<string, { default: unknown; type: string }>
        }
      }
    }
    const readme = await readFile('README.md', 'utf8')

    expect(
      packageJson.contributes.configuration.properties[
        'color-highlight.enableColorPicker'
      ],
    ).toStrictEqual(
      expect.objectContaining({
        default: false,
        type: 'boolean',
      }),
    )
    expect(readme).toContain('#### `color-highlight.enableColorPicker`')
  })

  it('exposes bounded workspace palette glob settings', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      contributes: {
        configuration: {
          properties: Record<string, { default: unknown; type: string }>
        }
      }
    }
    const properties = packageJson.contributes.configuration.properties

    expect(properties['color-highlight.workspacePaletteInclude']).toStrictEqual(
      expect.objectContaining({ default: '**/*', type: 'string' }),
    )
    expect(properties['color-highlight.workspacePaletteExclude']).toStrictEqual(
      expect.objectContaining({
        default:
          '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}',
        type: 'string',
      }),
    )
    expect(scopedConfigs.defaults.workspacePaletteInclude).toBe('**/*')
    expect(scopedConfigs.defaults.workspacePaletteExclude).toBe(
      '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}',
    )
  })

  it('documents opt-in contrast diagnostics', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      contributes: {
        configuration: {
          properties: Record<string, { default: unknown; type: string }>
        }
      }
    }
    const readme = await readFile('README.md', 'utf8')

    expect(
      packageJson.contributes.configuration.properties[
        'color-highlight.enableContrastDiagnostics'
      ],
    ).toStrictEqual(
      expect.objectContaining({ default: false, type: 'boolean' }),
    )
    expect(scopedConfigs.defaults.enableContrastDiagnostics).toBe(false)
    expect(readme).toContain('#### `color-highlight.enableContrastDiagnostics`')
    expect(readme).toContain('deterministic foreground/background pairs')
  })

  it('documents the complete workspace palette contract', async () => {
    const readme = await readFile('README.md', 'utf8')

    expect(readme).toContain('## Workspace palette and color contrast')
    expect(readme).toContain('`color-highlight.showWorkspacePalette`')
    expect(readme).toContain('`color-highlight.checkColorContrast`')
    expect(readme).toContain('`"**/*"`')
    expect(readme).toContain(
      '`"{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}"`',
    )
    expect(readme).toContain('256 workspace files')
    expect(readme).toContain('512 KiB of UTF-8 text per file')
    expect(readme).toMatch(/512\s+unique dependency-file reads/u)
    expect(readme).toMatch(/2,000 retained occurrences per\s+file/u)
    expect(readme).toContain('20,000 retained occurrences per scan')
    expect(readme).toContain('1,024 distinct color groups')
    expect(readme).toContain('occurrence truncation')
    expect(readme).toContain('file truncation')
    expect(readme).toContain('cancellable')
    expect(readme).toMatch(/HEX, RGB, HSL,\s+or OKLCH/u)
    expect(readme).toMatch(
      /opens the document and selects the exact source\s+text/u,
    )
    expect(readme).toMatch(/does not retain a workspace index/u)
  })

  it('documents WCAG contrast and deterministic diagnostics boundaries', async () => {
    const readme = await readFile('README.md', 'utf8')

    expect(readme).toContain('WCAG 2.2')
    expect(readme).toMatch(/4\.5:1 for AA\s+normal text/u)
    expect(readme).toMatch(/3:1 for AA large text/u)
    expect(readme).toMatch(/7:1 for AAA normal text/u)
    expect(readme).toMatch(/4\.5:1 for AAA\s+large text/u)
    expect(readme).toContain('translucent foreground')
    expect(readme).toContain('translucent background')
    expect(readme).toContain('default is `false`')
    expect(readme).toContain('CSS rule')
    expect(readme).toContain('inline `style` attribute')
    expect(readme).toMatch(/same\s+complete Tailwind variant chain/u)
    expect(readme).toContain('Check these colors')
    expect(readme).toContain('Go to foreground color')
    expect(readme).toContain('Go to background color')
    expect(readme).toContain('Disable contrast diagnostics')
    expect(readme).toContain('APCA')
  })

  it('documents workspace palette trust and Web compatibility', async () => {
    const readme = await readFile('README.md', 'utf8')

    expect(readme).toMatch(/do not execute project code/u)
    expect(readme).toMatch(
      /Direct colors remain\s+available in untrusted workspaces/u,
    )
    expect(readme).toMatch(/trusted cross-file dependency reads/u)
    expect(readme).toContain('vscode.dev')
    expect(readme).toContain('github.dev')
    expect(readme).toContain('virtual workspaces')
    expect(readme).toContain('VS Code Workspace FS')
  })

  it('documents default-on contextual color navigation', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      contributes: {
        configuration: {
          properties: Record<string, { default: unknown; type: string }>
        }
      }
    }
    const readme = await readFile('README.md', 'utf8')

    expect(
      packageJson.contributes.configuration.properties[
        'color-highlight.enableColorNavigation'
      ],
    ).toStrictEqual(
      expect.objectContaining({
        default: true,
        type: 'boolean',
      }),
    )
    expect(readme).toContain('#### `color-highlight.enableColorNavigation`')
    expect(scopedConfigs.defaults.enableColorNavigation).toBe(true)
    expect(readme).toContain('"color-highlight.enableColorNavigation": false')
    expect(readme).toContain('CSS custom property navigation uses')
    expect(readme).toContain('multiple selector or at-rule contexts')
    expect(readme).toContain('All cross-file reads are disabled')
    expect(readme).toMatch(/relative JSON,\s+JSONC, YAML, or YML dependencies/u)
    expect(readme).toMatch(
      /CSS sources[\s\S]{0,350}reads at most 64\s+source files of up to 512 KiB each/u,
    )
    expect(readme).toMatch(
      /SCSS modules[\s\S]{0,350}maximum depth of 5, reads at most 32 files,[\s\S]{0,100}limits each dependency to 512 KiB/u,
    )
    expect(readme).toMatch(
      /DTCG `\$ref` navigation[\s\S]{0,350}accepts only relative JSON,[\s\S]{0,150}at most 32 reference steps,[\s\S]{0,100}limits each external dependency to 512 KiB/u,
    )
  })

  it('documents DTCG, YAML, and opt-in cross-file token resolution', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      contributes: {
        configuration: {
          properties: Record<string, { default: unknown; type: string }>
        }
      }
    }
    const readme = await readFile('README.md', 'utf8')

    expect(
      packageJson.contributes.configuration.properties[
        'color-highlight.resolveDesignTokensAcrossFiles'
      ],
    ).toStrictEqual(
      expect.objectContaining({
        default: false,
        type: 'boolean',
      }),
    )
    expect(readme).toContain('- [x] YAML Design Tokens')
    expect(readme).toContain('all 14 DTCG color spaces')
    expect(readme).toContain('512 KiB')
  })

  it('documents Tailwind v3/v4 settings and bounded theme loading', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      contributes: {
        configuration: {
          properties: Record<
            string,
            {
              default: unknown
              enum?: string[]
              items?: { type: string }
              type: string
            }
          >
        }
      }
    }
    const properties = packageJson.contributes.configuration.properties
    const readme = await readFile('README.md', 'utf8')

    expect(properties['color-highlight.tailwindColorMode']).toStrictEqual(
      expect.objectContaining({
        default: 'auto',
        enum: ['auto', 'v3', 'v4'],
        type: 'string',
      }),
    )
    expect(properties['color-highlight.tailwindStylesheetPaths']).toStrictEqual(
      expect.objectContaining({
        default: [],
        items: { type: 'string' },
        type: 'array',
      }),
    )
    expect(scopedConfigs.defaults.tailwindColorMode).toBe('auto')
    expect(scopedConfigs.defaults.tailwindStylesheetPaths).toStrictEqual([])

    expect(readme).toContain('## Tailwind CSS theme colors')
    expect(readme).toContain('official `tailwindcss/colors` export')
    expect(readme).toContain('OKLCH')
    expect(readme).toMatch(
      /`auto`[\s\S]{0,300}v4 signals[\s\S]{0,300}v3 palette/u,
    )
    expect(readme).toMatch(/`v3`[\s\S]{0,200}legacy v3 palette/u)
    expect(readme).toMatch(/`v4`[\s\S]{0,200}official v4 palette/u)
    expect(readme).toContain('`@theme`, `@theme inline`, and `@theme static`')
    expect(readme).toContain('`--color-*: initial`')
    expect(readme).toContain('`--*: initial`')
    expect(readme).toContain('`--color-name: initial`')
    expect(readme).toMatch(/files,\s+directories, or glob patterns/u)
    expect(readme).toContain('workspace trust')
    expect(readme).toMatch(/relative CSS `@import` and `@reference`/u)
    expect(readme).toContain('at most 32 theme files per request')
    expect(readme).toMatch(/maximum\s+dependency depth of 5/u)
    expect(readme).toContain('512 KiB per file')
    expect(readme).toContain('`bg-[#50d71e]`')
    expect(readme).toContain('`text-[oklch(...)]`')
    expect(readme).toContain('`bg-(--color-brand)`')
    expect(readme).toContain('`bg-red-500!`')
    expect(readme).toContain('`tw:hover:bg-red-600`')
    expect(readme).toContain('Go to Definition')
    expect(readme).toContain('Tailwind compiler')
    expect(readme).toContain('JavaScript configuration')
  })
})
