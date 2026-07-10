import { describe, expect, it } from 'vitest'
import { collectCssVarDeclarations } from '../src/strategies/css-vars/parser'
import {
  resolveCssVarDefinition,
  resolveCssVarMatches,
} from '../src/strategies/css-vars/resolver'

function rangeOf(text: string, value: string, occurrence = 0) {
  let start = -1
  for (let index = 0; index <= occurrence; index++) {
    start = text.indexOf(value, start + 1)
  }
  return { start, end: start + value.length }
}

function optionsFor(text: string) {
  return {
    currentDeclarations: collectCssVarDeclarations(text, {
      filePath: '/workspace/app.css',
      trustedSelectors: [':root'],
    }),
    externalDeclarations: [],
  }
}

describe(resolveCssVarDefinition, () => {
  it('returns precise origin and declaration ranges', async () => {
    const text = ':root { --brand: #0ea5e9; } .card { color: var(--brand); }'

    await expect(
      resolveCssVarDefinition(
        text,
        text.indexOf('var(--brand)') + 6,
        optionsFor(text),
      ),
    ).resolves.toStrictEqual({
      originRange: rangeOf(text, 'var(--brand)'),
      targetFilePath: '/workspace/app.css',
      targetRange: {
        start: rangeOf(text, '--brand').start,
        end: rangeOf(text, '#0ea5e9').end,
      },
      targetSelectionRange: rangeOf(text, '--brand'),
    })
  })

  it('prefers the latest exact selector and at-rule context', async () => {
    const text = `
      .card { --brand: red; }
      @media screen { .card { --brand: blue; } }
      @media screen { .card { --brand: green; color: var(--brand); } }
    `
    const target = await resolveCssVarDefinition(
      text,
      text.lastIndexOf('var(--brand)') + 6,
      optionsFor(text),
    )

    expect(target?.targetSelectionRange).toStrictEqual(
      rangeOf(text, '--brand', 2),
    )
    await expect(
      resolveCssVarMatches(text, optionsFor(text)),
    ).resolves.toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: 'rgb(0, 128, 0)' }),
      ]),
    )
  })

  it('matches a declaration originating from the same selector-list rule', async () => {
    const text = '.a, .b { --brand: red; color: var(--brand); }'

    const target = await resolveCssVarDefinition(
      text,
      text.indexOf('var(--brand)') + 6,
      optionsFor(text),
    )

    expect(target?.targetSelectionRange).toStrictEqual(rangeOf(text, '--brand'))
  })

  it('keeps distinct selector-list declaration rules ambiguous', async () => {
    const text = `
      .a, .b { --brand: red; }
      .a, .c { --brand: blue; }
      .card { color: var(--brand); }
    `

    await expect(
      resolveCssVarDefinition(
        text,
        text.indexOf('var(--brand)') + 6,
        optionsFor(text),
      ),
    ).resolves.toBeNull()
  })

  it('uses latest declaration when all candidates share one context', async () => {
    const text = `
      :root { --brand: red; }
      :root { --brand: blue; }
      .card { color: var(--brand); }
    `

    const target = await resolveCssVarDefinition(
      text,
      text.indexOf('var(--brand)') + 6,
      optionsFor(text),
    )
    expect(target?.targetSelectionRange).toStrictEqual(
      rangeOf(text, '--brand', 1),
    )
  })

  it('uses a unique declaration as the conservative global fallback', async () => {
    const text = '.theme { --brand: red; } .card { color: var(--brand); }'

    const target = await resolveCssVarDefinition(
      text,
      text.indexOf('var(--brand)') + 6,
      optionsFor(text),
    )
    expect(target?.targetSelectionRange).toStrictEqual(rangeOf(text, '--brand'))
  })

  it('returns null for ambiguous declaration contexts', async () => {
    const text = `
      .light { --brand: white; }
      .dark { --brand: black; }
      .card { color: var(--brand); }
    `

    await expect(
      resolveCssVarDefinition(
        text,
        text.indexOf('var(--brand)') + 6,
        optionsFor(text),
      ),
    ).resolves.toBeNull()
  })

  it('resolves aliases to a color before returning the referenced declaration', async () => {
    const text = `
      :root { --base: #0ea5e9; --brand: var(--base); }
      .card { color: var(--brand); }
    `

    const target = await resolveCssVarDefinition(
      text,
      text.lastIndexOf('var(--brand)') + 6,
      optionsFor(text),
    )
    expect(target?.targetSelectionRange).toStrictEqual(rangeOf(text, '--brand'))
  })

  it('resolves a nested alias fallback before returning its declaration', async () => {
    const text = `
      :root { --base: #0ea5e9; --brand: var(--missing, var(--base)); }
      .card { color: var(--brand); }
    `

    const target = await resolveCssVarDefinition(
      text,
      text.lastIndexOf('var(--brand)') + 6,
      optionsFor(text),
    )
    expect(target?.targetSelectionRange).toStrictEqual(rangeOf(text, '--brand'))
  })

  it('returns null for cycles, fallback-only usages, and non-color variables', async () => {
    const text = `
      :root {
        --a: var(--b);
        --b: var(--a);
        --spacing: 1rem;
      }
      .card {
        color: var(--a);
        background: var(--a, red);
        border-color: var(--missing, red);
        gap: var(--spacing);
      }
    `
    const options = optionsFor(text)

    for (const usage of [
      'var(--a)',
      'var(--a, red)',
      'var(--missing, red)',
      'var(--spacing)',
    ]) {
      await expect(
        resolveCssVarDefinition(text, text.indexOf(usage) + 6, options),
      ).resolves.toBeNull()
    }
  })

  it('returns an external target only for a trusted color declaration', async () => {
    const text = '.card { color: var(--brand); }'
    const source = ':root { --brand: #0ea5e9; }'
    const externalDeclarations = collectCssVarDeclarations(source, {
      filePath: '/workspace/tokens.css',
      trustedSelectors: [':root'],
    })

    await expect(
      resolveCssVarDefinition(text, text.indexOf('--brand') + 2, {
        currentDeclarations: [],
        externalDeclarations,
      }),
    ).resolves.toStrictEqual({
      originRange: rangeOf(text, 'var(--brand)'),
      targetFilePath: '/workspace/tokens.css',
      targetRange: {
        start: rangeOf(source, '--brand').start,
        end: rangeOf(source, '#0ea5e9').end,
      },
      targetSelectionRange: rangeOf(source, '--brand'),
    })
  })
})
