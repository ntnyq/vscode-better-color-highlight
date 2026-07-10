import { bench, describe } from 'vitest'
import { findColorFunctions } from '../src/strategies/color-functions'
import { collectCssVarDeclarations } from '../src/strategies/css-vars/parser'
import { resolveCssVarMatches } from '../src/strategies/css-vars/resolver'
import { findHexRGBA } from '../src/strategies/hex'
import { findTailwindThemeColors } from '../src/strategies/tailwind-theme-colors'

const literalCss = Array.from(
  { length: 400 },
  (_, index) =>
    `.item-${index} { color: #ff0000; background: oklch(70% 0.2 40); }`,
).join('\n')

const tailwindMarkup = Array.from(
  { length: 500 },
  () => '<div class="bg-red-500 text-sky-300 hover:border-white/75"></div>',
).join('\n')

const variableCss = Array.from(
  { length: 100 },
  (_, index) =>
    `:root { --color-${index}: #${index.toString(16).padStart(6, '0')}; }`,
).join('\n')

const variableUsages = Array.from(
  { length: 100 },
  (_, index) => `.item-${index} { color: var(--color-${index}); }`,
).join('\n')

const declarations = collectCssVarDeclarations(variableCss, {
  trustedSelectors: [':root'],
})

describe('color detection', () => {
  bench('direct CSS literals', () => {
    findHexRGBA(literalCss)
    findColorFunctions(literalCss)
  })

  bench('Tailwind utilities', () => {
    findTailwindThemeColors(tailwindMarkup)
  })

  bench('CSS custom property resolution', async () => {
    await resolveCssVarMatches(variableUsages, {
      currentDeclarations: declarations,
      externalDeclarations: [],
    })
  })
})
