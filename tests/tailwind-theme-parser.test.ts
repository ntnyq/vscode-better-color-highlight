import { describe, expect, it } from 'vitest'
import { parseTailwindThemeSource } from '../src/strategies/tailwind-theme/parser'

function rangeOf(text: string, value: string, occurrence = 0) {
  let start = -1
  for (let index = 0; index <= occurrence; index++) {
    start = text.indexOf(value, start + 1)
  }
  return { start, end: start + value.length }
}

describe(parseTailwindThemeSource, () => {
  it('collects ranged declarations from all top-level theme forms', () => {
    const text = `
      @theme { --color-brand: #0ea5e9; }
      @theme inline { --color-alias: var(--brand); }
      @theme static { --color-accent: rgb(1 2 3); }
    `
    const parsed = parseTailwindThemeSource(text, '/workspace/theme.css')

    expect(parsed.themeDeclarations).toHaveLength(3)
    expect(parsed.themeDeclarations[0]).toMatchObject({
      name: '--color-brand',
      value: '#0ea5e9',
      inline: false,
      static: false,
      filePath: '/workspace/theme.css',
      nameRange: rangeOf(text, '--color-brand'),
      valueRange: rangeOf(text, '#0ea5e9'),
    })
    expect(parsed.themeDeclarations[1]).toMatchObject({
      inline: true,
      static: false,
    })
    expect(parsed.themeDeclarations[2]).toMatchObject({
      inline: false,
      static: true,
    })
  })

  it('preserves strings, functions, comments, and internal semicolons', () => {
    const text = `@theme {
      /* leading */ --color-brand: color-mix(in oklab, red 20%,
        var(--fallback, "a;b")); /* trailing */
    }`
    const parsed = parseTailwindThemeSource(text)
    const declaration = parsed.themeDeclarations[0]

    expect(declaration.value).toBe(
      'color-mix(in oklab, red 20%,\n        var(--fallback, "a;b"))',
    )
    expect(
      text.slice(declaration.nameRange.start, declaration.nameRange.end),
    ).toBe('--color-brand')
    expect(
      text.slice(declaration.valueRange.start, declaration.valueRange.end),
    ).toBe(declaration.value)
    expect(declaration.range).toStrictEqual({
      start: declaration.nameRange.start,
      end: declaration.valueRange.end,
    })
  })

  it('ignores nested and malformed theme blocks', () => {
    const text = `
      .scope { @theme { --color-nested: red; } }
      @media screen { @theme { --color-media: blue; } }
      @theme { --color-open: green;
    `

    expect(parseTailwindThemeSource(text).themeDeclarations).toStrictEqual([])
  })

  it('collects top-level theme declarations from HTML style elements', () => {
    const text = `<main></main>
      <style media="screen">
        @theme { --color-brand-muted: #50d71e; }
      </style>`
    const parsed = parseTailwindThemeSource(text, '/workspace/index.html')

    expect(parsed.hasV4Signal).toBe(true)
    expect(parsed.themeDeclarations).toHaveLength(1)
    expect(parsed.themeDeclarations[0]).toMatchObject({
      name: '--color-brand-muted',
      value: '#50d71e',
      filePath: '/workspace/index.html',
      nameRange: rangeOf(text, '--color-brand-muted'),
      valueRange: rangeOf(text, '#50d71e'),
    })
  })

  it('does not extract embedded style text from TSX source strings', () => {
    const text = `const el=<div/>; const x="<style>@theme{--color-decoy:red}</style>"; <div class="bg-decoy"/>`
    const parsed = parseTailwindThemeSource(text, '/workspace/App.tsx')

    expect(parsed.hasV4Signal).toBe(false)
    expect(parsed.themeDeclarations).toStrictEqual([])
  })

  it('does not assume embedded style semantics without a file path', () => {
    const text = `<style>@theme { --color-pathless: red; }</style>`
    const parsed = parseTailwindThemeSource(text)

    expect(parsed.hasV4Signal).toBe(false)
    expect(parsed.themeDeclarations).toStrictEqual([])
  })

  it.each(['vue', 'svelte'])(
    'extracts real %s style blocks but ignores script-string decoys',
    extension => {
      const text = `<script>
        const decoy = '<style>@theme { --color-decoy: red; }</style>'
      </script>
      <style>@theme { --color-brand: #0ea5e9; }</style>`
      const parsed = parseTailwindThemeSource(
        text,
        `/workspace/Component.${extension}`,
      )

      expect(parsed.themeDeclarations).toHaveLength(1)
      expect(parsed.themeDeclarations[0].nameRange).toStrictEqual(
        rangeOf(text, '--color-brand'),
      )
    },
  )

  it('ignores nested theme blocks inside HTML style elements', () => {
    const text = `<style>
      .scope { @theme { --color-nested: red; } }
      @media screen { @theme { --color-media: blue; } }
    </style>`

    expect(
      parseTailwindThemeSource(text, '/workspace/index.html').themeDeclarations,
    ).toStrictEqual([])
    expect(
      parseTailwindThemeSource(text, '/workspace/index.html').hasV4Signal,
    ).toBe(false)
  })

  it('ignores style element decoys inside HTML comments', () => {
    const text = `<!--
      <style>@theme { --color-decoy: red; }</style>
    -->`

    expect(
      parseTailwindThemeSource(text, '/workspace/index.html').themeDeclarations,
    ).toStrictEqual([])
    expect(
      parseTailwindThemeSource(text, '/workspace/index.html').hasV4Signal,
    ).toBe(false)
  })

  it('ignores style element decoys inside scripts and quoted attributes', () => {
    const text = `<script>
      const template = '<style>@theme { --color-script: red; }</style>'
    </script>
    <div data-template="<style>@theme { --color-attribute: blue; }</style>"></div>`

    expect(
      parseTailwindThemeSource(text, '/workspace/index.html').themeDeclarations,
    ).toStrictEqual([])
    expect(
      parseTailwindThemeSource(text, '/workspace/index.html').hasV4Signal,
    ).toBe(false)
  })

  it('ignores style element decoys inside source strings and comments', () => {
    const text = [
      `const markup = '<style>@theme { --color-script-string: red; }</style>'`,
      `.example { content: "<style>@theme { --color-style-string: blue; }</style>"; }`,
      `/* <style>@theme { --color-comment: green; }</style> */`,
    ].join('\n')

    expect(parseTailwindThemeSource(text).themeDeclarations).toStrictEqual([])
    expect(parseTailwindThemeSource(text).hasV4Signal).toBe(false)
  })

  it('finds case-insensitive style tags without losing exact offsets', () => {
    const text = `<STYLE data-label="a > b">
      @theme { --color-brand: #0ea5e9; }
    </StYlE>`
    const declaration = parseTailwindThemeSource(text, '/workspace/index.html')
      .themeDeclarations[0]

    expect(declaration.nameRange).toStrictEqual(rangeOf(text, '--color-brand'))
    expect(declaration.valueRange).toStrictEqual(rangeOf(text, '#0ea5e9'))
  })

  it('does not let an HTML text apostrophe hide a real style element', () => {
    const text = `<p>Here's an example</p><STYLE>@theme { --color-brand: #0ea5e9; }</STYLE>`
    const declaration = parseTailwindThemeSource(text, '/workspace/index.html')
      .themeDeclarations[0]

    expect(declaration.nameRange).toStrictEqual(rangeOf(text, '--color-brand'))
    expect(declaration.valueRange).toStrictEqual(rangeOf(text, '#0ea5e9'))
  })

  it('treats quotes and backticks in ordinary HTML text as prose', () => {
    const text = `<p>She said: "quoted text and code: \`literal example</p><style>@theme { --color-prose: blue; }</style>`
    const declaration = parseTailwindThemeSource(text, '/workspace/index.html')
      .themeDeclarations[0]

    expect(declaration.nameRange).toStrictEqual(rangeOf(text, '--color-prose'))
    expect(declaration.valueRange).toStrictEqual(rangeOf(text, 'blue'))
  })

  it('scans markup decoys in bounded linear time', () => {
    const decoy =
      '<div data-template="<style>@theme { --color-x: red; }</style>"></div>'
    const text = decoy.repeat(5000)
    const start = performance.now()

    expect(
      parseTailwindThemeSource(text, '/workspace/index.html').themeDeclarations,
    ).toStrictEqual([])
    expect(performance.now() - start).toBeLessThan(150)
  })

  it('collects contextual regular properties outside theme blocks', () => {
    const text = `
      :root { --brand: #0ea5e9; }
      .dark { --brand: #38bdf8; }
      @theme inline { --color-brand: var(--brand); }
    `
    const parsed = parseTailwindThemeSource(text, '/workspace/app.css')

    expect(parsed.customProperties.map(item => item.name)).toStrictEqual([
      '--brand',
      '--brand',
    ])
    expect(parsed.customProperties[0]).toMatchObject({
      value: '#0ea5e9',
      normalizedSelector: ':root',
      filePath: '/workspace/app.css',
    })
  })

  it('preserves raw regular-property values and skips comment-decoy names', () => {
    const text = `
      :root {
        /* --brand */ --brand: /* direct */ red /* kept */;
      }
    `
    const declaration = parseTailwindThemeSource(text).customProperties[0]

    expect(declaration.nameRange).toStrictEqual(rangeOf(text, '--brand', 1))
    expect(declaration.value).toBe('/* direct */ red /* kept */')
    expect(
      text.slice(declaration.valueRange.start, declaration.valueRange.end),
    ).toBe(declaration.value)
  })

  it('records top-level import and reference directives and v4 signals', () => {
    const text = `
      @import "tailwindcss";
      @import './tokens.css' layer(theme);
      @reference url("./utilities.css");
    `
    const parsed = parseTailwindThemeSource(text)

    expect(
      parsed.directives.map(({ kind, specifier }) => ({ kind, specifier })),
    ).toStrictEqual([
      { kind: 'import', specifier: 'tailwindcss' },
      { kind: 'import', specifier: './tokens.css' },
      { kind: 'reference', specifier: './utilities.css' },
    ])
    expect(parsed.hasV4Signal).toBe(true)
    expect(parsed.directives[1].specifierRange).toStrictEqual(
      rangeOf(text, './tokens.css'),
    )
  })

  it('locates declaration names structurally outside comments', () => {
    const text = `@theme {
      /* --color-brand belongs to this comment */ --color-brand: red;
    }`
    const declaration = parseTailwindThemeSource(text).themeDeclarations[0]

    expect(declaration.nameRange).toStrictEqual(
      rangeOf(text, '--color-brand', 1),
    )
    expect(
      text.slice(declaration.nameRange.start, declaration.nameRange.end),
    ).toBe('--color-brand')
  })

  it('tracks directive specifiers independently of repeated token text', () => {
    const text = `
      @import "import";
      @reference url("url");
      @import url(url);
    `
    const parsed = parseTailwindThemeSource(text)

    expect(
      parsed.directives.map(directive => directive.specifierRange),
    ).toStrictEqual([
      rangeOf(text, 'import', 1),
      rangeOf(text, 'url', 1),
      rangeOf(text, 'url', 3),
    ])
    for (const directive of parsed.directives) {
      expect(
        text.slice(
          directive.specifierRange.start,
          directive.specifierRange.end,
        ),
      ).toBe(directive.specifier)
    }
  })

  it('only treats valid top-level constructs as v4 signals', () => {
    expect(parseTailwindThemeSource('@import "./base.css";').hasV4Signal).toBe(
      false,
    )
    expect(
      parseTailwindThemeSource('.x { @reference "./base.css"; }').hasV4Signal,
    ).toBe(false)
    expect(
      parseTailwindThemeSource('@theme { --color-x: red; }').hasV4Signal,
    ).toBe(true)
  })
})
