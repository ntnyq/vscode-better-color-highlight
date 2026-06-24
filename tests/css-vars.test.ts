import { describe, expect, it } from 'vitest'
import {
  collectCssVarDeclarations,
  getCssSelectorSpecificity,
  isTrustedCssVarSelector,
  splitCssSelectorList,
} from '../src/strategies/css-var-parser'
import { resolveCssVarMatches } from '../src/strategies/css-var-resolver'
import { findCssVars } from '../src/strategies/css-vars'
import { FIXTURE_VARS_CSS } from './fixtures'

describe(findCssVars, () => {
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

  it('requires every comma selector item to be trusted', () => {
    expect(isTrustedCssVarSelector(':root, html', [':root', 'html'])).toBe(true)
    expect(
      isTrustedCssVarSelector(':root, [data-theme=dark]', [':root', 'html']),
    ).toBe(false)
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

  it('normalizes selector whitespace before trusted selector matching', () => {
    expect(
      isTrustedCssVarSelector('html   [data-theme=light]', [
        'html [data-theme=light]',
      ]),
    ).toBe(true)
  })

  it('computes simple selector specificity for trusted candidate ordering', () => {
    expect(getCssSelectorSpecificity(':root')).toStrictEqual([0, 1, 0])
    expect(getCssSelectorSpecificity('html')).toStrictEqual([0, 0, 1])
    expect(getCssSelectorSpecificity('html[data-theme=light]')).toStrictEqual([
      0, 1, 1,
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
      declarations.map(
        ({ normalizedSelector, specificity, isTrusted, sourceOrder }) => ({
          normalizedSelector,
          specificity,
          isTrusted,
          sourceOrder,
        }),
      ),
    ).toStrictEqual([
      {
        normalizedSelector: ':root',
        specificity: [0, 1, 0],
        isTrusted: true,
        sourceOrder: 0,
      },
      {
        normalizedSelector: 'html',
        specificity: [0, 0, 1],
        isTrusted: true,
        sourceOrder: 1,
      },
      {
        normalizedSelector: '[data-theme="brand,primary"]',
        specificity: [0, 1, 0],
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
      --brand: #0000ff;
      .b { color: var(--brand); }
    `

    const result = await findCssVars(text)

    expect(result).toHaveLength(1)
    expect(result[0].color).toBe('rgb(0, 0, 255)')
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
