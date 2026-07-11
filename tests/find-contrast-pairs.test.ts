import { describe, expect, it } from 'vitest'
import { findContrastPairs } from '../src/contrast/find-contrast-pairs'
import { collectStaticMarkupContexts } from '../src/contrast/markup-contexts'

function measureMalformedMarkup(count: number): number {
  const text = '<a x '.repeat(count)
  const start = performance.now()
  expect(collectStaticMarkupContexts(text, 'html')).toStrictEqual({
    attributes: [],
    styles: [],
  })
  return performance.now() - start
}

function measureUnclosedVueExpression(count: number): number {
  const text = `{{ "${'<a x '.repeat(count)}`
  const start = performance.now()
  expect(collectStaticMarkupContexts(text, 'vue')).toStrictEqual({
    attributes: [],
    styles: [],
  })
  return performance.now() - start
}

function measureUnclosedRegexExpression(count: number): number {
  const text = `{{ /[}}${'<a x '.repeat(count)}`
  const start = performance.now()
  expect(collectStaticMarkupContexts(text, 'vue')).toStrictEqual({
    attributes: [],
    styles: [],
  })
  return performance.now() - start
}

function measureUnclosedTagExpression(count: number): number {
  const text = `<div data={fn(${'value + '.repeat(count)}`
  const start = performance.now()
  expect(collectStaticMarkupContexts(text, 'svelte')).toStrictEqual({
    attributes: [],
    styles: [],
  })
  return performance.now() - start
}

function medianMeasurement(
  measure: (count: number) => number,
  count: number,
): number {
  const samples = Array.from({ length: 5 }, () => measure(count)).sort(
    (left, right) => left - right,
  )
  return samples[2] ?? 0
}

describe(findContrastPairs, () => {
  it('combines CSS and Tailwind contexts in source order without duplicates', async () => {
    const text = `<style>.a { color: red; background-color: white }</style>
      <div class="bg-black text-white" style="color: black; background-color: white">`

    const pairs = await findContrastPairs(text, { languageId: 'html' })

    expect(pairs.map(pair => pair.contextKey.split(':')[0])).toStrictEqual([
      'style',
      'tailwind',
      'inline',
    ])
    expect(new Set(pairs.map(pair => pair.contextKey)).size).toBe(3)
  })

  it('does not scan unsupported source languages', async () => {
    await expect(
      findContrastPairs('color: red; background-color: black', {
        languageId: 'plaintext',
      }),
    ).resolves.toStrictEqual([])
  })

  it('scans malformed tag suffixes in linear time', () => {
    measureMalformedMarkup(200)
    const small = medianMeasurement(measureMalformedMarkup, 10_000)
    const large = medianMeasurement(measureMalformedMarkup, 40_000)

    expect(large / small).toBeLessThan(8)

    const maxSizeCount = Math.floor((512 * 1024) / '<a x '.length)
    expect(measureMalformedMarkup(maxSizeCount)).toBeLessThan(500)
  })

  it.each([
    [
      'astro',
      `<div data = {fn({ text: '>', ok: /[}>]/.test(value) })} class="bg-black text-white">`,
    ],
    [
      'svelte',
      `<div {...props} data={fn({ text: '>', ok: /[}>]/.test(value) })} class="bg-black text-white">`,
    ],
    [
      'typescriptreact',
      `<div {...props} data={fn({ text: '>', ok: /[}>]/.test(value) })} className="bg-black text-white" />`,
    ],
  ])(
    'skips balanced host-expression attributes before static attributes in %s',
    async (languageId, text) => {
      const pairs = await findContrastPairs(text, { languageId })

      expect(pairs).toHaveLength(1)
      expect(pairs[0]?.foreground.range.start).toBe(
        text.lastIndexOf('text-white'),
      )
    },
  )

  it('skips malformed tag expressions in linear time', () => {
    measureUnclosedTagExpression(200)
    const small = medianMeasurement(measureUnclosedTagExpression, 10_000)
    const large = medianMeasurement(measureUnclosedTagExpression, 40_000)

    expect(large / small).toBeLessThan(8)
  })

  it.each([
    [
      'astro',
      `---
const decoy = '<div class="bg-black text-white" style="color:white;background-color:black">'
---
<div class="bg-black text-white">`,
    ],
    [
      'vue',
      `{{ '<div class="bg-black text-white" style="color:white;background-color:black">' }}
<div class="bg-black text-white">`,
    ],
    [
      'svelte',
      `{ nested({ value: '<div class="bg-black text-white">', brace: '}' /* } */ }) }
<div class="bg-black text-white">`,
    ],
  ])(
    'ignores markup-looking host expressions in %s',
    async (languageId, text) => {
      const pairs = await findContrastPairs(text, { languageId })

      expect(pairs).toHaveLength(1)
      expect(pairs[0]?.contextKey).toContain('tailwind:')
      expect(pairs[0]?.foreground.range.start).toBe(
        text.lastIndexOf('text-white'),
      )
    },
  )

  it('skips unclosed host expressions in linear time', () => {
    measureUnclosedVueExpression(200)
    const small = medianMeasurement(measureUnclosedVueExpression, 10_000)
    const large = medianMeasurement(measureUnclosedVueExpression, 40_000)

    expect(large / small).toBeLessThan(8)
    const maxSizeCount = Math.floor((512 * 1024) / '<a x '.length)
    expect(measureUnclosedVueExpression(maxSizeCount)).toBeLessThan(500)
  })

  it('masks host-expression theme decoys from real Tailwind attributes', async () => {
    const text = `{{ '<style>@theme { --color-decoy: #000; }</style>' }}
<div class="bg-decoy text-white">`

    await expect(
      findContrastPairs(text, {
        filePath: '/repo/App.vue',
        languageId: 'vue',
        tailwindColorMode: 'v4',
      }),
    ).resolves.toStrictEqual([])
  })

  it.each([
    [
      'astro',
      `{ /\\}/.test(value) ? '<div class="bg-black text-white">' : '' }
<div class="bg-black text-white">`,
    ],
    [
      'vue',
      `{{ /}}/.test(value) ? '<div class="bg-black text-white">' : '' }}
<div class="bg-black text-white">`,
    ],
    [
      'svelte',
      `{ /[}]/.test(value) ? '<div class="bg-black text-white">' : '' }
<div class="bg-black text-white">`,
    ],
    [
      'typescriptreact',
      `const regex = /["}]/; const decoy = '<div class="bg-black text-white">';
<div className="bg-black text-white" />`,
    ],
  ])(
    'skips regex-safe host expression decoys in %s',
    async (languageId, text) => {
      const pairs = await findContrastPairs(text, { languageId })

      expect(pairs).toHaveLength(1)
      expect(pairs[0]?.foreground.range.start).toBe(
        text.lastIndexOf('text-white'),
      )
    },
  )

  it.each([
    [
      'astro',
      `{ total / count }
<div class="bg-black text-white">`,
    ],
    [
      'vue',
      `{{ total / count }}
<div class="bg-black text-white">`,
    ],
    [
      'svelte',
      `{ total / count }
<div class="bg-black text-white">`,
    ],
    [
      'typescriptreact',
      `const ratio = total / count;
<div className="bg-black text-white" />`,
    ],
  ])(
    'keeps division controls and real markup in %s',
    async (languageId, text) => {
      await expect(
        findContrastPairs(text, { languageId }),
      ).resolves.toHaveLength(1)
    },
  )

  it.each([
    'const ratio = value++ / total;',
    'const ratio = fn(value) / total;',
    'const ratio = (value) / total;',
  ])('keeps markup after postfix or grouped division: %s', async source => {
    const text = `${source}
<div className="bg-black text-white" />`

    await expect(
      findContrastPairs(text, { languageId: 'typescriptreact' }),
    ).resolves.toHaveLength(1)
  })

  it.each([
    'const ratio = obj.return / total;',
    'const ratio = obj.in / total;',
    'const ratio = obj.if(value) / total;',
    'const ratio = obj?.return / total;',
    'const ratio = obj?.in / total;',
    'const ratio = obj?.if(value) / total;',
    'const ratio = obj.else / total;',
    'const ratio = obj?.do / total;',
  ])(
    'keeps keyword-shaped member access in division context: %s',
    async source => {
      const text = `${source}
<div className="bg-black text-white" />`

      await expect(
        findContrastPairs(text, { languageId: 'typescriptreact' }),
      ).resolves.toHaveLength(1)
    },
  )

  it.each([
    'const of = 2; const ratio = of / total;',
    'function f(of) { return of / total }',
    'const value = { of: 2 }; const ratio = value.of / total;',
    'for (let index = consume(of / total); index < 1; index++) {}',
    'for (let index = consume(value.of / total); index < 1; index++) {}',
    'for (let of = 2; of / total > 0; of--) {}',
    'for (const value of of / total) {}',
    'for (const value of consume(of / total)) {}',
    'for (const value of source.of / total) {}',
  ])('keeps ordinary of identifiers in division context: %s', async source => {
    const text = `${source}
<div className="bg-black text-white" />`

    await expect(
      findContrastPairs(text, { languageId: 'typescriptreact' }),
    ).resolves.toHaveLength(1)
  })

  it('treats the first of identifier as the LHS before the separator', async () => {
    const text = `for (of of values) {}
<div className="bg-black text-white" />`

    await expect(
      findContrastPairs(text, { languageId: 'typescriptreact' }),
    ).resolves.toHaveLength(1)
  })

  it.each([
    'for (const value of /["}]/.exec(values)) {}',
    'for (of of /["}]/.exec(values)) {}',
    'for (const [value] of /["}]/.exec(values)) {}',
    'for (const { value } of /["}]/.exec(values)) {}',
  ])('allows regex after one valid for-of separator: %s', async source => {
    const text = `${source}
const decoy = '<div className="bg-black text-white" />';
<div className="bg-black text-white" />`
    const pairs = await findContrastPairs(text, {
      languageId: 'typescriptreact',
    })

    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.foreground.range.start).toBe(
      text.lastIndexOf('text-white'),
    )
  })

  it('preserves the for header through contextual await', async () => {
    const text = `async function scan(values) {
  for await (const value of /["}]/.exec(values)) {}
}
const decoy = '<div className="bg-black text-white" />';
<div className="bg-black text-white" />`
    const pairs = await findContrastPairs(text, {
      languageId: 'typescriptreact',
    })

    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.foreground.range.start).toBe(
      text.lastIndexOf('text-white'),
    )
  })

  it.each([
    'await (of / total);',
    'object.await(of / total);',
    'for await value (const item of / total);',
    'for await await (const item of / total);',
    'for await; (const item of / total);',
    'for object.await (const item of / total);',
  ])(
    'does not create a for header for non-contextual await: %s',
    async source => {
      const text = `${source}
<div className="bg-black text-white" />`

      await expect(
        findContrastPairs(text, { languageId: 'typescriptreact' }),
      ).resolves.toHaveLength(1)
    },
  )

  it.each(['if', 'while', 'for', 'with', 'switch', 'catch'])(
    'recognizes regex literals after %s statement parentheses',
    async keyword => {
      const condition = keyword === 'for' ? ';;' : 'value'
      const text = `${keyword} (${condition}) /["}]/.test(value);
const decoy = '<div className="bg-black text-white" />';
<div className="bg-black text-white" />`

      const pairs = await findContrastPairs(text, {
        languageId: 'typescriptreact',
      })

      expect(pairs).toHaveLength(1)
      expect(pairs[0]?.foreground.range.start).toBe(
        text.lastIndexOf('text-white'),
      )
    },
  )

  it.each([
    'return /["}]/.test(value);',
    'const matcher = /["}]/;',
    'const matcher = value ? /["}]/ : /["}]/;',
  ])('keeps regex literals after expression prefixes: %s', async source => {
    const text = `${source}
const decoy = '<div className="bg-black text-white" />';
<div className="bg-black text-white" />`
    const pairs = await findContrastPairs(text, {
      languageId: 'typescriptreact',
    })

    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.foreground.range.start).toBe(
      text.lastIndexOf('text-white'),
    )
  })

  it.each([
    'if (value) {} else /["}]/.test(value);',
    'do /["}]/.test(value); while (value);',
  ])(
    'recognizes regex expression statements after else or do: %s',
    async source => {
      const text = `${source}
const decoy = '<div className="bg-black text-white" />';
<div className="bg-black text-white" />`
      const pairs = await findContrastPairs(text, {
        languageId: 'typescriptreact',
      })

      expect(pairs).toHaveLength(1)
      expect(pairs[0]?.foreground.range.start).toBe(
        text.lastIndexOf('text-white'),
      )
    },
  )

  it('scans malformed regex expressions in linear time', () => {
    measureUnclosedRegexExpression(200)
    const small = medianMeasurement(measureUnclosedRegexExpression, 10_000)
    const large = medianMeasurement(measureUnclosedRegexExpression, 40_000)

    expect(large / small).toBeLessThan(8)
  })

  it.each(['textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes'])(
    'ignores markup-looking text inside raw element %s',
    async element => {
      const text = `<${element} data-kind="raw"><div class="bg-black text-white" style="color:white;background-color:black"></${element}>
<div class="bg-black text-white">`

      const pairs = await findContrastPairs(text, { languageId: 'html' })

      expect(pairs).toHaveLength(1)
      expect(pairs[0]?.foreground.range.start).toBe(
        text.lastIndexOf('text-white'),
      )
    },
  )

  it('matches mixed-case raw tags and only real closing tag boundaries', async () => {
    const text = `<TeXtArEa data-kind="raw"><div class="bg-black text-white"></textarea-extra>
<div class="bg-black text-white"></textarea data-fake>
<div class="bg-black text-white"></TEXTAREA>
<div class="bg-black text-white">`

    const pairs = await findContrastPairs(text, { languageId: 'html' })

    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.foreground.range.start).toBe(
      text.lastIndexOf('text-white'),
    )
  })

  it('treats plaintext as terminal while title and textarea resume', async () => {
    const plaintext = `<PlAiNtExT><div class="bg-black text-white"></pLaInTeXt>
<div class="bg-black text-white">`

    await expect(
      findContrastPairs(plaintext, { languageId: 'html' }),
    ).resolves.toStrictEqual([])

    for (const element of ['title', 'textarea']) {
      await expect(
        findContrastPairs(
          `<${element}>decoy</${element}><div class="bg-black text-white">`,
          { languageId: 'html' },
        ),
      ).resolves.toHaveLength(1)
    }
  })

  it.each(['textarea', 'iframe', 'plaintext'])(
    'ignores the remainder of unclosed raw element %s',
    async element => {
      await expect(
        findContrastPairs(`<${element}><div class="bg-black text-white">`, {
          languageId: 'html',
        }),
      ).resolves.toStrictEqual([])
    },
  )

  it('keeps style content as CSS without parsing nested markup strings', async () => {
    const text = `<style>.a { content: '<div class="bg-black text-white">'; color: white; background-color: black; }</style>
<div class="bg-black text-white">`

    const pairs = await findContrastPairs(text, { languageId: 'html' })

    expect(pairs).toHaveLength(2)
    expect(pairs.map(pair => pair.contextKey.split(':')[0])).toStrictEqual([
      'style',
      'tailwind',
    ])
  })
})
