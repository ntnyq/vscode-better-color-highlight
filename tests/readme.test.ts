import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

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
