import { describe, expect, it, vi } from 'vitest'
import type * as CssSourcesModule from '../src/strategies/css-vars/sources'
import type * as TailwindDefinitionModule from '../src/strategies/tailwind-theme/definition'
import type * as LoggerModule from '../src/utils/logger'

const loggerError = vi.fn<(message: unknown) => void>()
const loadCssVarSourceDeclarations = vi.fn<
  typeof CssSourcesModule.loadCssVarSourceDeclarations
>(() => Promise.resolve([]))
const resolveTailwindColorDefinition = vi.fn<
  typeof TailwindDefinitionModule.resolveTailwindColorDefinition
>(() => Promise.resolve(null))

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
vi.mock(import('../src/strategies/tailwind-theme/definition'), () => ({
  resolveTailwindColorDefinition,
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
    'html',
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'vue',
    'svelte',
    'astro',
  ])('dispatches Tailwind navigation for %s', async languageId => {
    const expected = {
      originRange: { start: 7, end: 15 },
      targetFilePath: 'file:///workspace/theme.css',
      targetRange: { start: 9, end: 31 },
      targetSelectionRange: { start: 9, end: 22 },
    }
    resolveTailwindColorDefinition.mockResolvedValueOnce(expected)
    const { resolveColorDefinition } =
      await import('../src/color-navigation/resolve-color-definition')

    await expect(
      resolveColorDefinition('class="bg-brand"', 10, {
        ...baseContext,
        languageId,
      }),
    ).resolves.toStrictEqual(expected)
  })

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

  it('preserves JSON and JSONC design-token dispatch without Tailwind', async () => {
    resolveTailwindColorDefinition.mockClear()
    const { resolveColorDefinition } =
      await import('../src/color-navigation/resolve-color-definition')
    const text =
      '{"brand":{"$type":"color","$value":{"colorSpace":"srgb","components":[1,0,0]}},"alias":{"$value":"{brand}"}}'

    for (const languageId of ['json', 'jsonc']) {
      await expect(
        resolveColorDefinition(text, text.indexOf('{brand}') + 2, {
          ...baseContext,
          languageId,
        }),
      ).resolves.not.toBeNull()
    }
    expect(resolveTailwindColorDefinition).not.toHaveBeenCalled()
  })

  it('dispatches plaintext .tokens documents as JSON design tokens', async () => {
    resolveTailwindColorDefinition.mockClear()
    const { resolveColorDefinition } =
      await import('../src/color-navigation/resolve-color-definition')
    const text =
      '{"brand":{"$type":"color","$value":{"colorSpace":"srgb","components":[1,0,0]}},"alias":{"$value":"{brand}"}}'

    await expect(
      resolveColorDefinition(text, text.indexOf('{brand}') + 2, {
        ...baseContext,
        filePath: 'file:///workspace/theme.tokens',
        languageId: 'plaintext',
      }),
    ).resolves.not.toBeNull()
    expect(resolveTailwindColorDefinition).not.toHaveBeenCalled()
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

  it('bounds and cancels external CSS variable definition reads', async () => {
    loadCssVarSourceDeclarations.mockClear()
    const signal = { isCancellationRequested: false }
    const { resolveColorDefinition } =
      await import('../src/color-navigation/resolve-color-definition')
    const text = ':root { --brand: #f00; } a { color: var(--brand); }'

    await resolveColorDefinition(text, text.indexOf('var(--brand)') + 4, {
      ...baseContext,
      signal,
      resolveCssVariablesAcrossFiles: true,
      cssVariablePaths: ['tokens.css'],
    })

    const workspaceReadBudget = expect.objectContaining({
      tryClaim: expect.any(Function),
    })
    expect(loadCssVarSourceDeclarations).toHaveBeenCalledWith(
      expect.objectContaining({ signal, workspaceReadBudget }),
    )
  })
})
