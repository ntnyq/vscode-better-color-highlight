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
  () =>
    '<div class="tw:hover:bg-mauve-500! text-[oklch(70%_0.2_40)] fill-(--color-brand) border-[#50d71e]/50"></div>',
).join('\n')

const adversarialTailwind = `${'variant:'.repeat(10_000)}${'['.repeat(10_000)}x`

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

  bench('bounded Tailwind candidate scanning', () => {
    findTailwindThemeColors(adversarialTailwind)
  })

  bench('CSS custom property resolution', async () => {
    await resolveCssVarMatches(variableUsages, {
      currentDeclarations: declarations,
      externalDeclarations: [],
    })
  })
})
