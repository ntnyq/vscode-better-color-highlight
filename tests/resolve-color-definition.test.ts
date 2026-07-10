import { describe, expect, it, vi } from 'vitest'
import type * as CssSourcesModule from '../src/strategies/css-vars/sources'
import type * as LoggerModule from '../src/utils/logger'

const loggerError = vi.fn<(message: unknown) => void>()
const loadCssVarSourceDeclarations = vi.fn<
  typeof CssSourcesModule.loadCssVarSourceDeclarations
>(() => Promise.resolve([]))

vi.mock(
  import('../src/utils/logger'),
  () =>
    ({
      logger: { error: loggerError },
    }) as unknown as typeof LoggerModule,
)
vi.mock(import('../src/strategies/css-vars/sources'), () => ({
  loadCssVarSourceDeclarations,
}))

const baseContext = {
  languageId: 'css',
  filePath: 'file:///workspace/source.css',
  namedColorMatchMode: 'context' as const,
  resolveScssVariablesAcrossFiles: false,
  scssLoadPaths: [],
  resolveCssVariablesAcrossFiles: false,
  cssVariablePaths: [],
  cssVariableTrustedSelectors: [':root', 'html', 'body', ':host'],
  designTokenJsonMode: 'token-values' as const,
  resolveDesignTokensAcrossFiles: false,
  useARGB: false,
  workspaceIsTrusted: true,
}

describe('resolveColorDefinition', () => {
  it.each([
    [
      'css',
      ':root { --brand: #f00; } a { color: var(--brand); }',
      'var(--brand)',
    ],
    ['scss', '$brand: #f00; a { color: $brand; }', '$brand; }'],
    ['less', '@brand: #f00; a { color: @brand; }', '@brand; }'],
    ['stylus', '$brand = #f00\na\n  color $brand', '$brand'],
    [
      'json',
      '{"brand":{"$type":"color","$value":{"colorSpace":"srgb","components":[1,0,0]}},"alias":{"$value":"{brand}"}}',
      '{brand}',
    ],
    [
      'jsonc',
      '{"brand":{"$type":"color","$value":{"colorSpace":"srgb","components":[1,0,0]}},"alias":{"$value":"{brand}"}}',
      '{brand}',
    ],
    [
      'yaml',
      'brand:\n  $type: color\n  $value: { colorSpace: srgb, components: [1, 0, 0] }\nalias:\n  $value: "{brand}"',
      '{brand}',
    ],
    [
      'yml',
      'brand:\n  $type: color\n  $value: { colorSpace: srgb, components: [1, 0, 0] }\nalias:\n  $value: "{brand}"',
      '{brand}',
    ],
  ])('dispatches %s documents', async (languageId, text, usageText) => {
    const { resolveColorDefinition } =
      await import('../src/color-navigation/resolve-color-definition')
    const usage = text.lastIndexOf(usageText)

    const target = await resolveColorDefinition(text, usage + 2, {
      ...baseContext,
      languageId,
      filePath: `file:///workspace/source.${languageId}`,
    })

    expect(target).not.toBeNull()
    expect(target?.targetFilePath).toBe(
      `file:///workspace/source.${languageId}`,
    )
  })

  it('returns null for unsupported languages and disabled token mode', async () => {
    const { resolveColorDefinition } =
      await import('../src/color-navigation/resolve-color-definition')
    const text =
      '{"brand":{"$type":"color","$value":"#f00"},"alias":{"$value":"{brand}"}}'

    await expect(
      resolveColorDefinition(text, text.indexOf('{brand}') + 2, {
        ...baseContext,
        languageId: 'typescript',
      }),
    ).resolves.toBeNull()
    await expect(
      resolveColorDefinition(text, text.indexOf('{brand}') + 2, {
        ...baseContext,
        languageId: 'json',
        designTokenJsonMode: 'off',
      }),
    ).resolves.toBeNull()
  })

  it.each(['json', 'jsonc'])(
    'does not resolve structured %s aliases in strings mode',
    async languageId => {
      const { resolveColorDefinition } =
        await import('../src/color-navigation/resolve-color-definition')
      const text =
        '{"brand":{"$type":"color","$value":{"colorSpace":"srgb","components":[1,0,0]}},"alias":{"$value":"{brand}"}}'

      await expect(
        resolveColorDefinition(text, text.indexOf('{brand}') + 2, {
          ...baseContext,
          languageId,
          designTokenJsonMode: 'strings',
        }),
      ).resolves.toBeNull()
    },
  )

  it('keeps YAML alias navigation enabled in strings mode', async () => {
    const { resolveColorDefinition } =
      await import('../src/color-navigation/resolve-color-definition')
    const text =
      'brand:\n  $type: color\n  $value: { colorSpace: srgb, components: [1, 0, 0] }\nalias:\n  $value: "{brand}"'

    await expect(
      resolveColorDefinition(text, text.indexOf('{brand}') + 2, {
        ...baseContext,
        languageId: 'yaml',
        designTokenJsonMode: 'strings',
      }),
    ).resolves.not.toBeNull()
  })

  it('isolates resolver errors as a logged no-result', async () => {
    loadCssVarSourceDeclarations.mockRejectedValueOnce(new Error('read failed'))
    const { resolveColorDefinition } =
      await import('../src/color-navigation/resolve-color-definition')
    const text = ':root { --brand: #f00; } a { color: var(--brand); }'

    await expect(
      resolveColorDefinition(text, text.indexOf('var(--brand)') + 4, {
        ...baseContext,
        resolveCssVariablesAcrossFiles: true,
        cssVariablePaths: ['tokens.css'],
      }),
    ).resolves.toBeNull()
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('read failed'),
    )
  })
})
