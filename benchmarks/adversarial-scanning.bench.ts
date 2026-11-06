import { describe, test } from 'vitest'
import { findColorFunctions } from '../src/engine/strategies/color-functions'
import { findCssVars } from '../src/engine/strategies/css-vars'
import { findTailwindThemeColors } from '../src/engine/strategies/tailwind-theme'
import { parseTailwindThemeSource } from '../src/engine/strategies/tailwind-theme/parser'
import { findTailwindColorUtilities } from '../src/engine/strategies/tailwind-theme/utility'
import { collectStaticMarkupContexts } from '../src/features/contrast/markup-contexts'

describe('adversarial scanning trends', () => {
  for (const count of [10_000, 20_000]) {
    const css = Array.from(
      { length: count },
      (_, index) => `.a${index} { --c${index}: red; color: var(--c${index}); }`,
    ).join('\n')
    test(`CSS variable declarations and usages ${count}`, async ({ bench }) => {
      await bench(
        'CSS variables',
        {
          writeResult: `.benchmarks/css-variable-index-${count}.json`,
        },
        () => findCssVars(css),
      ).run()
    })
    const markup = `${'<a x '.repeat(count)}<style `
    test(`unterminated embedded style tags ${count}`, async ({ bench }) => {
      await bench(
        'embedded styles',
        {
          writeResult: `.benchmarks/unterminated-embedded-styles-${count}.json`,
        },
        () => parseTailwindThemeSource(markup, '/workspace/App.vue'),
      ).run()
    })
  }

  for (const [index, repeated] of ['1', '.', ' ', '--'].entries()) {
    const text = `--brand-rgb: ${repeated.repeat(64_000)}x`
    test(`malformed shorthand ${JSON.stringify(repeated)}`, async ({
      bench,
    }) => {
      await bench(
        'malformed shorthand',
        {
          writeResult: `.benchmarks/malformed-shorthand-${index}.json`,
        },
        () => findColorFunctions(text),
      ).run()
    })
  }

  for (const count of [10_000, 40_000]) {
    const selectors = `${'.foo#id:hover'.repeat(count)}.bg-red-500 {}`
    const cases = [
      {
        name: 'malformed tags',
        languageId: 'html',
        text: '<a x '.repeat(count),
      },
      {
        name: 'unclosed Vue expression',
        languageId: 'vue',
        text: `{{ "${'<a x '.repeat(count)}`,
      },
      {
        name: 'unclosed regex expression',
        languageId: 'vue',
        text: `{{ /[}}${'<a x '.repeat(count)}`,
      },
      {
        name: 'unclosed tag expression',
        languageId: 'svelte',
        text: `<div data={fn(${'value + '.repeat(count)}`,
      },
    ]
    for (const fixture of cases) {
      test(`${fixture.name} ${count}`, async ({ bench }) => {
        await bench(
          fixture.name,
          {
            writeResult: `.benchmarks/${fixture.name.replaceAll(' ', '-')}-${count}.json`,
          },
          () => collectStaticMarkupContexts(fixture.text, fixture.languageId),
        ).run()
      })
    }
    test(`punctuation-heavy selectors ${count}`, async ({ bench }) => {
      await bench(
        'punctuation-heavy selectors',
        {
          writeResult: `.benchmarks/punctuation-heavy-selectors-${count}.json`,
        },
        () => findTailwindThemeColors(selectors),
      ).run()
    })
  }

  const colons = `${'a:'.repeat(5000)}x`
  test('colon-heavy non-utilities', async ({ bench }) => {
    await bench(
      'colon-heavy non-utilities',
      {
        writeResult: '.benchmarks/colon-heavy-non-utilities.json',
      },
      () => findTailwindThemeColors(colons),
    ).run()
  })
  const brackets = [`${'a:'.repeat(20_000)}x`, `${'['.repeat(20_000)}x`].join(
    ' ',
  )
  test('colon and bracket-heavy non-utilities', async ({ bench }) => {
    await bench(
      'colon and bracket-heavy non-utilities',
      {
        writeResult: '.benchmarks/colon-and-bracket-heavy-non-utilities.json',
      },
      () => findTailwindColorUtilities(brackets),
    ).run()
  })
})
