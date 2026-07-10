import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { scopedConfigs } from '../src/meta'

describe('readme generated config documentation', () => {
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
})
