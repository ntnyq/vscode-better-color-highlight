import { describe, expect, it } from 'vitest'
import { parseTailwindThemeSource } from '../src/strategies/tailwind-theme/parser'
import {
  resolveTailwindTheme,
  resolveTailwindThemeColor,
} from '../src/strategies/tailwind-theme/resolver'

function rangeOf(text: string, value: string, occurrence = 0) {
  let start = -1
  for (let index = 0; index <= occurrence; index++) {
    start = text.indexOf(value, start + 1)
  }
  return { start, end: start + value.length }
}

function resolve(...texts: string[]) {
  return resolveTailwindTheme(
    texts.map((text, index) =>
      parseTailwindThemeSource(text, `/workspace/theme-${index}.css`),
    ),
    { mode: 'v3' },
  )
}

describe(resolveTailwindTheme, () => {
  it('applies declarations and overrides in source order', async () => {
    const first = '@theme { --color-brand: red; }'
    const second = '@theme static { --color-brand: #0ea5e9; }'
    const theme = await resolve(first, second)

    await expect(
      resolveTailwindThemeColor(theme, 'brand'),
    ).resolves.toStrictEqual({
      value: 'rgb(14, 165, 233)',
      source: {
        value: '#0ea5e9',
        filePath: '/workspace/theme-1.css',
        range: {
          start: rangeOf(second, '--color-brand').start,
          end: rangeOf(second, '#0ea5e9').end,
        },
        valueRange: rangeOf(second, '#0ea5e9'),
      },
    })
  })

  it('models namespace resets and individual initial removals', async () => {
    const theme = await resolve(`
      @theme {
        --color-*: initial;
        --color-brand: red;
        --color-brand: initial;
        --color-accent: blue;
      }
      @theme { --*: initial; --color-final: green; }
    `)

    expect(theme.hasColorNamespaceReset).toBe(true)
    expect(theme.colors.has('red-500')).toBe(false)
    await expect(resolveTailwindThemeColor(theme, 'brand')).resolves.toBeNull()
    await expect(resolveTailwindThemeColor(theme, 'accent')).resolves.toBeNull()
    await expect(
      resolveTailwindThemeColor(theme, 'final'),
    ).resolves.toMatchObject({ value: 'rgb(0, 128, 0)' })
  })

  it('resolves direct colors and exact theme aliases', async () => {
    const theme = await resolve(`@theme {
      --color-base: oklch(70% 0.1 200);
      --color-brand: var(--color-base);
    }`)

    const base = await resolveTailwindThemeColor(theme, 'base')
    const brand = await resolveTailwindThemeColor(theme, 'brand')
    expect(base?.value).toMatch(/^rgb\(/u)
    expect(brand?.value).toBe(base?.value)
  })

  it('resolves inline aliases through a unique regular property', async () => {
    const theme = await resolve(`
      :root { --brand: #0ea5e9; }
      @theme inline { --color-brand: var(--brand); }
    `)

    await expect(
      resolveTailwindThemeColor(theme, 'brand'),
    ).resolves.toMatchObject({ value: 'rgb(14, 165, 233)' })
  })

  it('rejects ambiguous regular property contexts', async () => {
    const theme = await resolve(`
      .light { --brand: white; }
      .dark { --brand: black; }
      @theme inline { --color-brand: var(--brand); }
    `)

    await expect(resolveTailwindThemeColor(theme, 'brand')).resolves.toBeNull()
  })

  it('uses the latest declaration when candidates share one context', async () => {
    const theme = await resolve(`
      :root { --brand: red; }
      :root { --brand: blue; }
      @theme inline { --color-brand: var(--brand); }
    `)

    await expect(
      resolveTailwindThemeColor(theme, 'brand'),
    ).resolves.toMatchObject({ value: 'rgb(0, 0, 255)' })
  })

  it('rejects cycles, missing aliases, non-inline regular aliases, and composites', async () => {
    const theme = await resolve(`
      :root { --regular: red; }
      @theme {
        --color-a: var(--color-b);
        --color-b: var(--color-a);
        --color-missing: var(--color-nope);
        --color-regular: var(--regular);
        --color-composite: color-mix(in srgb, red, var(--color-a));
        --color-spacing: 1rem;
      }
    `)

    for (const name of [
      'a',
      'b',
      'missing',
      'regular',
      'composite',
      'spacing',
    ]) {
      await expect(resolveTailwindThemeColor(theme, name)).resolves.toBeNull()
    }
  })

  it('keeps metadata for the final active alias declaration', async () => {
    const text = `@theme {
      --color-base: red;
      --color-brand: var(--color-base);
    }`
    const theme = await resolve(text)
    const result = await resolveTailwindThemeColor(theme, 'brand')

    expect(result?.source).toStrictEqual({
      filePath: '/workspace/theme-0.css',
      value: 'red',
      range: {
        start: rangeOf(text, '--color-base').start,
        end: rangeOf(text, 'red').end,
      },
      valueRange: rangeOf(text, 'red'),
    })
  })

  it('keeps final regular-property metadata through inline aliases', async () => {
    const text = `
      :root { --final: #0ea5e9; --brand: var(--final); }
      @theme inline { --color-brand: var(--brand); }
    `
    const theme = await resolve(text)
    const result = await resolveTailwindThemeColor(theme, 'brand')

    expect(result?.source).toStrictEqual({
      filePath: '/workspace/theme-0.css',
      value: '#0ea5e9',
      range: {
        start: rangeOf(text, '--final').start,
        end: rangeOf(text, '#0ea5e9').end,
      },
      valueRange: rangeOf(text, '#0ea5e9'),
    })
  })

  it('treats comments as whitespace while retaining raw source values', async () => {
    const text = `@theme {
      --color-*: /* reset */ initial /* now */;
      --color-base: /* direct */ rgb(1 2 3) /* kept */;
      --color-brand: var(/* alias */ --color-base /* exact */);
      --color-remove: red;
      --color-remove: /* remove */ initial;
    }`
    const theme = await resolve(text)
    const result = await resolveTailwindThemeColor(theme, 'brand')

    expect(theme.hasColorNamespaceReset).toBe(true)
    expect(theme.colors.has('red-500')).toBe(false)
    expect(theme.colors.has('remove')).toBe(false)
    expect(result).toStrictEqual({
      value: 'rgb(1, 2, 3)',
      source: {
        filePath: '/workspace/theme-0.css',
        value: '/* direct */ rgb(1 2 3) /* kept */',
        range: {
          start: rangeOf(text, '--color-base').start,
          end: rangeOf(text, '/* kept */').end,
        },
        valueRange: {
          start: rangeOf(text, '/* direct */').start,
          end: rangeOf(text, '/* kept */').end,
        },
      },
    })
  })

  it('selects v4 in auto mode when a source contains a v4 signal', async () => {
    const source = parseTailwindThemeSource('@reference "./theme.css";')
    const theme = await resolveTailwindTheme([source], { mode: 'auto' })

    expect(theme.mode).toBe('v4')
    expect(theme.hasV4Signal).toBe(true)
  })
})
