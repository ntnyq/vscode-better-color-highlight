import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findCssVars } from '../src/strategies/css-vars'
import {
  collectCssVarDeclarations,
  splitCssSelectorList,
} from '../src/strategies/css-vars/parser'
import type { CssVarDeclaration } from '../src/strategies/css-vars/parser'
import { resolveCssVarMatches } from '../src/strategies/css-vars/resolver'
import type { LoadCssVarSourceDeclarationsOptions } from '../src/strategies/css-vars/sources'
import { FIXTURE_VARS_CSS } from './fixtures'

const { loadCssVarSourceDeclarationsMock } = vi.hoisted(() => ({
  loadCssVarSourceDeclarationsMock: vi
    .fn<
      (
        options: LoadCssVarSourceDeclarationsOptions,
      ) => Promise<CssVarDeclaration[]>
    >()
    .mockResolvedValue([]),
}))

vi.mock(import('../src/strategies/css-vars/sources'), () => ({
  loadCssVarSourceDeclarations: loadCssVarSourceDeclarationsMock,
}))

describe(findCssVars, () => {
  beforeEach(() => {
    loadCssVarSourceDeclarationsMock.mockReset()
    loadCssVarSourceDeclarationsMock.mockResolvedValue([])
  })

  it('marks default trusted selectors as trusted', () => {
    const declarations = collectCssVarDeclarations(
      ':root { --brand: #0ea5e9; } [data-theme=dark] { --brand: white; }',
      {
        filePath: '/workspace/src/app.css',
        trustedSelectors: [':root', 'html', 'body', ':host'],
      },
    )

    expect(declarations).toHaveLength(2)
    expect(declarations[0]).toMatchObject({
      name: '--brand',
      value: '#0ea5e9',
      selector: ':root',
      isTrusted: true,
    })
    expect(declarations[1]).toMatchObject({
      name: '--brand',
      value: 'white',
      selector: '[data-theme=dark]',
      isTrusted: false,
    })
  })

  it('splits selector lists without splitting inside strings, brackets, or parentheses', () => {
    expect(
      splitCssSelectorList(
        String.raw`:root, [data-theme="light,dark"], :is(html, body), .icon[data-url="data:image/svg+xml,%3Csvg%3E"]`,
      ),
    ).toStrictEqual([
      ':root',
      '[data-theme="light,dark"]',
      ':is(html, body)',
      '.icon[data-url="data:image/svg+xml,%3Csvg%3E"]',
    ])
  })

  it('walks nested at-rule bodies without treating at-rules as selectors', () => {
    const declarations = collectCssVarDeclarations(
      `
        @media (prefers-color-scheme: dark) {
          :root { --media-brand: #111111; }
        }

        @layer theme {
          html { --layer-brand: #222222; }
        }

        @media screen {
          @supports (color: color(display-p3 1 0 0)) {
            body { --supports-brand: #333333; }
          }
        }
      `,
      {
        trustedSelectors: [':root', 'html', 'body'],
      },
    )

    expect(
      declarations.map(({ name, normalizedSelector, value }) => ({
        name,
        normalizedSelector,
        value,
      })),
    ).toStrictEqual([
      {
        name: '--media-brand',
        normalizedSelector: ':root',
        value: '#111111',
      },
      {
        name: '--layer-brand',
        normalizedSelector: 'html',
        value: '#222222',
      },
      {
        name: '--supports-brand',
        normalizedSelector: 'body',
        value: '#333333',
      },
    ])
  })

  it('emits selector list declarations per selector item', () => {
    const declarations = collectCssVarDeclarations(
      ':root, html, [data-theme="brand,primary"] { --brand: red; }',
      {
        trustedSelectors: [':root', 'html'],
      },
    )

    expect(
      declarations.map(({ normalizedSelector, isTrusted, sourceOrder }) => ({
        normalizedSelector,
        isTrusted,
        sourceOrder,
      })),
    ).toStrictEqual([
      {
        normalizedSelector: ':root',
        isTrusted: true,
        sourceOrder: 0,
      },
      {
        normalizedSelector: 'html',
        isTrusted: true,
        sourceOrder: 1,
      },
      {
        normalizedSelector: '[data-theme="brand,primary"]',
        isTrusted: false,
        sourceOrder: 2,
      },
    ])
  })

  it('ignores commented declarations and preserves semicolons in values', () => {
    const declarations = collectCssVarDeclarations(
      String.raw`
        :root {
          /* --brand: red; */
          --icon: url("data:image/svg+xml;utf8,<svg></svg>");
          --label: "semi;colon";
        }
      `,
      {
        trustedSelectors: [':root'],
      },
    )

    expect(declarations).toHaveLength(2)
    expect(
      declarations.map(({ name, value }) => ({ name, value })),
    ).toStrictEqual([
      {
        name: '--icon',
        value: 'url("data:image/svg+xml;utf8,<svg></svg>")',
      },
      {
        name: '--label',
        value: '"semi;colon"',
      },
    ])
  })

  it('finds CSS variable usages with hex values', async () => {
    const text = `
      --my-color: #ff0000;
      .cls { color: var(--my-color); }
    `
    const result = await findCssVars(text)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
  })

  it('finds CSS variable usages with rgb() values', async () => {
    const text = `
      --my-color: rgb(0, 0, 255);
      .cls { color: var(--my-color); }
    `
    const result = await findCssVars(text)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(0, 0, 255)')
  })

  it('finds variable usages when the definition is inline in a rule block', async () => {
    const text =
      ':root { --named-red: #ff0000; } .cls { color: var(--named-red); }'
    const result = await findCssVars(text)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
    expect(text.slice(result[0].start, result[0].end)).toBe('var(--named-red)')
  })

  it('resolves current-file variables using declaration document order', async () => {
    const text = `
      .a { --brand: #ff0000; }
      .a { --brand: #0000ff; }
      .a { color: var(--brand); }
    `

    const result = await findCssVars(text)

    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(0, 0, 255)')
  })

  it('skips current-file variables declared in different selector contexts', async () => {
    const text = `
      .light { --brand: #ffffff; }
      .dark { --brand: #000000; }
      .card { color: var(--brand); }
    `

    await expect(findCssVars(text)).resolves.toStrictEqual([])
  })

  it('skips variables split between unconditional and conditional contexts', async () => {
    const text = `
      :root { --brand: #ffffff; }
      @media (prefers-color-scheme: dark) {
        :root { --brand: #000000; }
      }
      .card { color: var(--brand); }
    `

    await expect(findCssVars(text)).resolves.toStrictEqual([])
  })

  it('finds CSS variable usages with named-color values', async () => {
    const text = `
      :root { --named-red: red; }
      .cls { color: var(--named-red); }
    `
    const result = await findCssVars(text)
    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(255, 0, 0)')
    expect(text.slice(result[0].start, result[0].end)).toBe('var(--named-red)')
  })

  it('resolves nested CSS variable references', async () => {
    const text = `
      :root {
        --base-red: #ff0000;
        --named-red: var(--base-red);
      }
      .cls { color: var(--named-red); }
    `
    const result = await findCssVars(text)
    expect(
      result.some(
        match => text.slice(match.start, match.end) === 'var(--named-red)',
      ),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('highlights exact CSS variable aliases inside custom property declarations', async () => {
    const text = `
      .partial-name-safe {
        --red: #ff0000;
        --red2: var(--red);
        --red-long: var(--red2);
        color: var(--red2);
        border-color: var(--red-long);
      }
    `

    const result = await findCssVars(text)
    const usages = result.map(match => text.slice(match.start, match.end))

    expect(usages).toStrictEqual([
      'var(--red)',
      'var(--red2)',
      'var(--red2)',
      'var(--red-long)',
    ])
    expect(result.every(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('skips nested variables inside composite declaration values', async () => {
    const text = `
      :root {
        --base-red: #ff0000;
        --mixed-red: color-mix(in srgb, var(--base-red), white);
      }
      .cls { color: var(--mixed-red); }
    `
    const result = await findCssVars(text)

    expect(result).toStrictEqual([])
  })

  it('skips direct color tokens inside composite declaration values', async () => {
    const text = `
      :root {
        --border-token: 1px solid red;
      }
      .cls { border-color: var(--border-token); }
    `
    const result = await findCssVars(text)

    expect(result).toStrictEqual([])
  })

  it('skips shorthand values with extra tokens', async () => {
    const text = `
      :root {
        --brand-rgb: 255 0 0 1px;
      }
      .cls { color: var(--brand-rgb); }
    `
    const result = await findCssVars(text)

    expect(result).toStrictEqual([])
  })

  it('skips shorthand alpha values with extra tokens', async () => {
    const text = `
      :root {
        --brand-rgb: 255 0 0 / 50% extra;
      }
      .cls { color: var(--brand-rgb); }
    `
    const result = await findCssVars(text)

    expect(result).toStrictEqual([])
  })

  it('skips shorthand inline alpha values with extra slash segments', async () => {
    const text = `
      :root {
        --brand-rgb: 255 0 0/50%/extra;
      }
      .cls { color: var(--brand-rgb); }
    `
    const result = await findCssVars(text)

    expect(result).toStrictEqual([])
  })

  it('resolves CSS shorthand triplet custom properties inside rule blocks', async () => {
    const text = `
      .css-var-shorthand {
        --brand-rgb: 255 0 0;
        --brand-hsl: 0 100% 50%;
        color: var(--brand-rgb);
        background: var(--brand-hsl);
      }
    `
    const result = await findCssVars(text)

    expect(
      result.some(
        match => text.slice(match.start, match.end) === 'var(--brand-rgb)',
      ),
    ).toBe(true)
    expect(
      result.some(
        match => text.slice(match.start, match.end) === 'var(--brand-hsl)',
      ),
    ).toBe(true)
    expect(result.some(match => match.color === 'rgb(255, 0, 0)')).toBe(true)
  })

  it('returns empty when no variables are defined', async () => {
    const result = await findCssVars('color: #ff0000;')
    expect(result).toStrictEqual([])
  })

  it('does not read external paths when cross-file resolution is disabled by default', async () => {
    const text = '.cls { color: var(--brand); }'

    const result = await findCssVars(text, {
      languageId: 'css',
      filePath: '/workspace/src/app.css',
      cssVariablePaths: ['/workspace/tokens.css'],
    })

    expect(result).toStrictEqual([])
    expect(loadCssVarSourceDeclarationsMock).not.toHaveBeenCalled()
  })

  it('does not read external paths when cross-file resolution is false', async () => {
    const text = '.cls { color: var(--brand); }'

    const result = await findCssVars(text, {
      languageId: 'css',
      filePath: '/workspace/src/app.css',
      resolveCssVariablesAcrossFiles: false,
      cssVariablePaths: ['/workspace/tokens.css'],
    })

    expect(result).toStrictEqual([])
    expect(loadCssVarSourceDeclarationsMock).not.toHaveBeenCalled()
  })

  it('does not read external paths when the workspace is untrusted', async () => {
    const text = '.cls { color: var(--brand); }'

    const result = await findCssVars(text, {
      languageId: 'css',
      filePath: '/workspace/src/app.css',
      workspaceIsTrusted: false,
      resolveCssVariablesAcrossFiles: true,
      cssVariablePaths: ['/workspace/tokens.css'],
    })

    expect(result).toStrictEqual([])
    expect(loadCssVarSourceDeclarationsMock).not.toHaveBeenCalled()
  })

  it('resolves CSS variables from configured external declarations when enabled', async () => {
    const text = '.cls { color: var(--brand); }'
    loadCssVarSourceDeclarationsMock.mockResolvedValue(
      collectCssVarDeclarations(':root { --brand: #0ea5e9; }', {
        filePath: '/workspace/tokens.css',
        trustedSelectors: [':root'],
      }),
    )

    const result = await findCssVars(text, {
      languageId: 'css',
      filePath: '/workspace/src/app.css',
      resolveCssVariablesAcrossFiles: true,
      cssVariablePaths: ['/workspace/tokens.css'],
      cssVariableTrustedSelectors: [':root'],
    })

    expect(loadCssVarSourceDeclarationsMock).toHaveBeenCalledWith({
      filePath: '/workspace/src/app.css',
      paths: ['/workspace/tokens.css'],
      trustedSelectors: [':root'],
    })
    expect(result).toStrictEqual([
      {
        start: text.indexOf('var(--brand)'),
        end: text.indexOf('var(--brand)') + 'var(--brand)'.length,
        color: 'rgb(14, 165, 233)',
      },
    ])
  })

  it('uses default trusted selectors when loading external declarations', async () => {
    const text = '.cls { color: var(--brand); }'

    await findCssVars(text, {
      languageId: 'css',
      filePath: '/workspace/src/app.css',
      resolveCssVariablesAcrossFiles: true,
      cssVariablePaths: ['/workspace/tokens.css'],
    })

    expect(loadCssVarSourceDeclarationsMock).toHaveBeenCalledWith({
      filePath: '/workspace/src/app.css',
      paths: ['/workspace/tokens.css'],
      trustedSelectors: [':root', 'html', 'body', ':host'],
    })
  })

  it('matches the expected playground CSS variable usages without false definition hits', async () => {
    const result = await findCssVars(FIXTURE_VARS_CSS)
    const usages = result.map(match =>
      FIXTURE_VARS_CSS.slice(match.start, match.end),
    )

    const expectedUsages = [
      'var(--hex-6)',
      'var(--rgb-comma)',
      'var(--hsl-comma)',
      'var(--named-red)',
      'var(--hex-8)',
      'var(--hwb)',
      'var(--oklch)',
      'var(--hex-4)',
      'var(--srgb-accent)',
      'var(--srgb-linear-accent)',
      'var(--display-p3-accent)',
      'var(--a98-accent)',
      'var(--rec2020-accent)',
      'var(--prophoto-accent)',
      'var(--xyz-accent)',
      'var(--xyz-d50-accent)',
      'var(--xyz-d65-accent)',
      'var(--token-rgb)',
      'var(--token-hsl)',
      'var(--token-lch)',
      'var(--token-oklch)',
      'var(--token-lab)',
      'var(--token-oklab)',
    ]

    const actualUniqueUsages = [...new Set(usages)]
    const missingUsages = expectedUsages.filter(
      usage => !actualUniqueUsages.includes(usage),
    )
    const falseDefinitionHits = usages.filter(usage => usage.startsWith('--'))

    expect(expectedUsages).toHaveLength(23)
    expect(actualUniqueUsages).toStrictEqual(
      expect.arrayContaining(expectedUsages),
    )
    expect(missingUsages).toStrictEqual([])
    expect(falseDefinitionHits).toStrictEqual([])
  })

  it('resolves external trusted declarations when cross-file data is provided', async () => {
    const text = '.cls { color: var(--brand); }'
    const externalDeclarations = collectCssVarDeclarations(
      ':root { --brand: #0ea5e9; }',
      {
        filePath: '/workspace/tokens.css',
        trustedSelectors: [':root'],
      },
    )

    const result = await resolveCssVarMatches(text, {
      currentDeclarations: [],
      externalDeclarations,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('var(--brand)'),
        end: text.indexOf('var(--brand)') + 'var(--brand)'.length,
        color: 'rgb(14, 165, 233)',
      },
    ])
  })

  it('uses latest external declaration for the same trusted selector', async () => {
    const text = '.cls { color: var(--brand); }'
    const externalDeclarations = collectCssVarDeclarations(
      `
        :root { --brand: #0ea5e9; }
        :root { --brand: #ff0000; }
      `,
      {
        filePath: '/workspace/tokens.css',
        trustedSelectors: [':root'],
      },
    )

    const result = await resolveCssVarMatches(text, {
      currentDeclarations: [],
      externalDeclarations,
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('var(--brand)'),
        end: text.indexOf('var(--brand)') + 'var(--brand)'.length,
        color: 'rgb(255, 0, 0)',
      },
    ])
  })

  it('treats external trusted declarations from different selectors as ambiguous', async () => {
    const text = '.cls { color: var(--brand); }'
    const externalDeclarations = collectCssVarDeclarations(
      `
        :root { --brand: #0ea5e9; }
        body { --brand: #ff0000; }
      `,
      {
        filePath: '/workspace/tokens.css',
        trustedSelectors: [':root', 'body'],
      },
    )

    const result = await resolveCssVarMatches(text, {
      currentDeclarations: [],
      externalDeclarations,
    })

    expect(result).toStrictEqual([])
  })

  it('uses fallback when external variable missing', async () => {
    const text = '.cls { color: var(--missing, #ff0000); }'

    const result = await resolveCssVarMatches(text, {
      currentDeclarations: [],
      externalDeclarations: [],
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('var(--missing, #ff0000)'),
        end:
          text.indexOf('var(--missing, #ff0000)') +
          'var(--missing, #ff0000)'.length,
        color: 'rgb(255, 0, 0)',
      },
    ])
  })

  it('skips fallback when external variable declarations are ambiguous', async () => {
    const text = '.cls { color: var(--brand, #ffffff); }'
    const externalDeclarations = collectCssVarDeclarations(
      `
        :root { --brand: #0ea5e9; }
        [data-theme=dark] { --brand: #000; }
      `,
      {
        filePath: '/workspace/tokens.css',
        trustedSelectors: [':root'],
      },
    )

    const result = await resolveCssVarMatches(text, {
      currentDeclarations: [],
      externalDeclarations,
    })

    expect(result).toStrictEqual([])
  })

  it('skips cyclic CSS variable references', async () => {
    const text = `
      :root {
        --brand: var(--accent);
        --accent: var(--brand);
      }
      .cls { color: var(--brand); }
    `
    const currentDeclarations = collectCssVarDeclarations(text, {
      trustedSelectors: [':root'],
    })

    const result = await resolveCssVarMatches(text, {
      currentDeclarations,
      externalDeclarations: [],
    })

    expect(result).toStrictEqual([])
  })

  it('uses only caller fallback for cyclic CSS variable references', async () => {
    const text = `
      :root {
        --a: var(--b, red);
        --b: var(--a, blue);
      }
      .x { color: var(--a, green); }
    `
    const currentDeclarations = collectCssVarDeclarations(text, {
      trustedSelectors: [':root'],
    })

    const result = await resolveCssVarMatches(text, {
      currentDeclarations,
      externalDeclarations: [],
    })

    expect(result).toStrictEqual([
      {
        start: text.indexOf('var(--a, green)'),
        end: text.indexOf('var(--a, green)') + 'var(--a, green)'.length,
        color: 'rgb(0, 128, 0)',
      },
    ])
  })

  it('propagates ambiguity through aliases without using alias fallback', async () => {
    const text = `
      :root { --alias: var(--brand, #ffffff); }
      .x { color: var(--alias); }
    `
    const currentDeclarations = collectCssVarDeclarations(text, {
      trustedSelectors: [':root'],
    })
    const externalDeclarations = collectCssVarDeclarations(
      `
        :root { --brand: #0ea5e9; }
        [data-theme=dark] { --brand: #ff0000; }
      `,
      {
        filePath: '/workspace/tokens.css',
        trustedSelectors: [':root'],
      },
    )

    const result = await resolveCssVarMatches(text, {
      currentDeclarations,
      externalDeclarations,
    })

    expect(result).toStrictEqual([])
  })

  it('does not scrape fallback colors from cyclic nested variables', async () => {
    const text = `
      :root {
        --alias: color-mix(in srgb, var(--cycle, #ffffff), black);
        --cycle: var(--alias);
      }
      .x { color: var(--alias); }
    `
    const currentDeclarations = collectCssVarDeclarations(text, {
      trustedSelectors: [':root'],
    })

    const result = await resolveCssVarMatches(text, {
      currentDeclarations,
      externalDeclarations: [],
    })

    expect(result).toStrictEqual([])
  })

  it('treats external untrusted same-name declarations as ambiguous', async () => {
    const text = '.cls { color: var(--brand); }'
    const externalDeclarations = collectCssVarDeclarations(
      `
        :root { --brand: #0ea5e9; }
        [data-theme=dark] { --brand: #ff0000; }
      `,
      {
        filePath: '/workspace/tokens.css',
        trustedSelectors: [':root'],
      },
    )

    const result = await resolveCssVarMatches(text, {
      currentDeclarations: [],
      externalDeclarations,
    })

    expect(result).toStrictEqual([])
  })
})
