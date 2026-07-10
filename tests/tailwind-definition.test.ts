import { describe, expect, it, vi } from 'vitest'
import { parseTailwindThemeSource } from '../src/strategies/tailwind-theme/parser'
import type * as SourcesModule from '../src/strategies/tailwind-theme/sources'

const loadTailwindThemeSources = vi.fn<
  typeof SourcesModule.loadTailwindThemeSources
>((text, context) =>
  Promise.resolve([parseTailwindThemeSource(text, context.filePath)]),
)

vi.mock(import('../src/strategies/tailwind-theme/sources'), () => ({
  loadTailwindThemeSources,
}))

const context = {
  filePath: 'file:///workspace/page.html',
  languageId: 'html',
  tailwindColorMode: 'v4' as const,
  tailwindStylesheetPaths: [] as string[],
  workspaceIsTrusted: true,
}

function rangeOf(text: string, value: string, occurrence = 0) {
  let start = -1
  for (let index = 0; index <= occurrence; index++) {
    start = text.indexOf(value, start + 1)
  }
  return { start, end: start + value.length }
}

describe('resolveTailwindColorDefinition', () => {
  it('returns exact utility and final custom declaration ranges', async () => {
    const text = `<style>@theme {
  --color-base: #0ea5e9;
  --color-brand: var(--color-base);
}</style>
<div class="hover:!bg-brand/50"></div>`
    const { resolveTailwindColorDefinition } =
      await import('../src/strategies/tailwind-theme/definition')

    const target = await resolveTailwindColorDefinition(
      text,
      text.indexOf('bg-brand') + 3,
      context,
    )

    expect(target).toStrictEqual({
      originRange: rangeOf(text, 'hover:!bg-brand/50'),
      targetFilePath: context.filePath,
      targetRange: {
        start: rangeOf(text, '--color-base').start,
        end: rangeOf(text, '#0ea5e9').end,
      },
      targetSelectionRange: rangeOf(text, '--color-base'),
    })
  })

  it('navigates inline aliases to the final regular property', async () => {
    const text = `<style>:root { --brand: #123456; }
@theme inline { --color-brand: var(--brand); }</style>
<div class="bg-brand!"></div>`
    const { resolveTailwindColorDefinition } =
      await import('../src/strategies/tailwind-theme/definition')

    await expect(
      resolveTailwindColorDefinition(
        text,
        text.lastIndexOf('bg-brand') + 2,
        context,
      ),
    ).resolves.toStrictEqual({
      originRange: rangeOf(text, 'bg-brand!'),
      targetFilePath: context.filePath,
      targetRange: {
        start: rangeOf(text, '--brand').start,
        end: rangeOf(text, '#123456').end,
      },
      targetSelectionRange: rangeOf(text, '--brand'),
    })
  })

  it('preserves imported target URIs and ranges', async () => {
    const sourceText = '@theme { --color-brand: #abcdef; }'
    loadTailwindThemeSources.mockResolvedValueOnce([
      parseTailwindThemeSource(sourceText, 'file:///workspace/theme.css'),
      parseTailwindThemeSource('', context.filePath),
    ])
    const text = '<div class="md:bg-brand/25"></div>'
    const { resolveTailwindColorDefinition } =
      await import('../src/strategies/tailwind-theme/definition')

    await expect(
      resolveTailwindColorDefinition(text, text.indexOf('brand'), {
        ...context,
        tailwindStylesheetPaths: ['theme.css'],
      }),
    ).resolves.toStrictEqual({
      originRange: rangeOf(text, 'md:bg-brand/25'),
      targetFilePath: 'file:///workspace/theme.css',
      targetRange: {
        start: rangeOf(sourceText, '--color-brand').start,
        end: rangeOf(sourceText, '#abcdef').end,
      },
      targetSelectionRange: rangeOf(sourceText, '--color-brand'),
    })
  })

  it('targets the final override through parenthesized property syntax', async () => {
    const text = `<style>@theme {
  --color-brand: red;
  --color-brand: blue;
}</style>
<div class="tw:hover:bg-(--color-brand)!"></div>`
    const { resolveTailwindColorDefinition } =
      await import('../src/strategies/tailwind-theme/definition')

    await expect(
      resolveTailwindColorDefinition(
        text,
        text.lastIndexOf('--color-brand') + 3,
        context,
      ),
    ).resolves.toStrictEqual({
      originRange: rangeOf(text, 'tw:hover:bg-(--color-brand)!'),
      targetFilePath: context.filePath,
      targetRange: {
        start: rangeOf(text, '--color-brand', 1).start,
        end: rangeOf(text, 'blue').end,
      },
      targetSelectionRange: rangeOf(text, '--color-brand', 1),
    })
  })

  it('returns no target for defaults, arbitrary colors, resets, or invalid aliases', async () => {
    const { resolveTailwindColorDefinition } =
      await import('../src/strategies/tailwind-theme/definition')
    const cases = [
      '<div class="bg-red-500"></div>',
      '<div class="bg-[#123456]"></div>',
      '<style>@theme { --color-brand: initial; }</style><div class="bg-brand"></div>',
      '<style>@theme { --color-a: var(--color-b); --color-b: var(--color-a); }</style><div class="bg-a"></div>',
      '<style>.a { --x: red }.b { --x: blue } @theme inline { --color-brand: var(--x); }</style><div class="bg-brand"></div>',
      '<style>@theme { --color-brand: 1rem; }</style><div class="bg-brand"></div>',
    ]

    for (const text of cases) {
      const utility = text.lastIndexOf('bg-')
      await expect(
        resolveTailwindColorDefinition(text, utility + 3, context),
      ).resolves.toBeNull()
    }
  })

  it('does not load theme sources unless the cursor is on a Tailwind token', async () => {
    loadTailwindThemeSources.mockClear()
    const { resolveTailwindColorDefinition } =
      await import('../src/strategies/tailwind-theme/definition')
    const text = '<div class="bg-brand">plain text</div>'

    await expect(
      resolveTailwindColorDefinition(text, text.indexOf('plain'), {
        ...context,
        tailwindStylesheetPaths: ['theme.css'],
      }),
    ).resolves.toBeNull()
    expect(loadTailwindThemeSources).not.toHaveBeenCalled()
  })
})
