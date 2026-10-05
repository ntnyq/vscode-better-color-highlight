import { describe, test } from 'vitest'
import { findAndroidColors } from '../src/engine/strategies/android-colors'
import { parseAndroidResourceDocument } from '../src/engine/strategies/android-resources/parser'
import { findColorFunctions } from '../src/engine/strategies/color-functions'
import { collectCssVarDeclarations } from '../src/engine/strategies/css-vars/parser'
import { resolveCssVarMatches } from '../src/engine/strategies/css-vars/resolver'
import { findHexRGBA } from '../src/engine/strategies/hex'
import { findSwiftColors } from '../src/engine/strategies/swift-colors'
import { findTailwindThemeColors } from '../src/engine/strategies/tailwind-theme'

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

const nestedExpression = `${'rgb(from '.repeat(24)}color-mix(in srgb, red, blue)${' calc(r * .9) g b)'.repeat(24)}`
const malformedExpression = `${'rgb(from '.repeat(10_000)}red`
const longChain = `:root { ${Array.from({ length: 200 }, (_, index) => `--v${index}: var(--v${index + 1});`).join(' ')} --v200: red; } .x { color: rgb(from var(--v0) r g b); }`
const chainDeclarations = collectCssVarDeclarations(longChain, {
  trustedSelectors: [':root'],
})
const nativeColors =
  'Color(1f, 0f, 0f, .5f); Color(red: 1, green: 0, blue: 0);'.repeat(400)

const androidResources = `<resources>${Array.from({ length: 500 }, (_, index) => `<color name="brand_${index}">#80ff0000</color><item type="color" name="alias_${index}">@color/brand_${index}</item>`).join('\n')}</resources>`
const malformedAndroidResource = `<resources><${'color'.repeat(20_000)}`

describe('color detection', () => {
  test('android resource declarations and aliases', async ({ bench }) => {
    await bench(
      'android resource declarations and aliases',
      {
        writeResult:
          '.benchmarks/android-resource-declarations-and-aliases.json',
      },
      () => {
        parseAndroidResourceDocument(androidResources, true)
      },
    ).run()
  })

  test('unclosed android resource tags', async ({ bench }) => {
    await bench(
      'unclosed android resource tags',
      { writeResult: '.benchmarks/unclosed-android-resource-tags.json' },
      () => {
        parseAndroidResourceDocument(malformedAndroidResource, true)
      },
    ).run()
  })

  test('nested relative colors and interpolation', async ({ bench }) => {
    await bench(
      'nested relative colors and interpolation',
      {
        writeResult:
          '.benchmarks/nested-relative-colors-and-interpolation.json',
      },
      () => {
        findColorFunctions(nestedExpression)
      },
    ).run()
  })

  test('unclosed color expressions', async ({ bench }) => {
    await bench(
      'unclosed color expressions',
      { writeResult: '.benchmarks/unclosed-color-expressions.json' },
      () => {
        findColorFunctions(malformedExpression)
      },
    ).run()
  })

  test('bounded long variable chains', async ({ bench }) => {
    await bench(
      'bounded long variable chains',
      { writeResult: '.benchmarks/bounded-long-variable-chains.json' },
      async () => {
        await resolveCssVarMatches(longChain, {
          currentDeclarations: chainDeclarations,
          externalDeclarations: [],
        })
      },
    ).run()
  })

  test('native component constructors', async ({ bench }) => {
    await bench(
      'native component constructors',
      { writeResult: '.benchmarks/native-component-constructors.json' },
      () => {
        findAndroidColors(nativeColors)
        findSwiftColors(nativeColors)
      },
    ).run()
  })
  test('direct CSS literals', async ({ bench }) => {
    await bench(
      'direct CSS literals',
      { writeResult: '.benchmarks/direct-css-literals.json' },
      () => {
        findHexRGBA(literalCss)
        findColorFunctions(literalCss)
      },
    ).run()
  })

  test('Tailwind utilities', async ({ bench }) => {
    await bench(
      'Tailwind utilities',
      { writeResult: '.benchmarks/tailwind-utilities.json' },
      () => {
        findTailwindThemeColors(tailwindMarkup)
      },
    ).run()
  })

  test('bounded Tailwind candidate scanning', async ({ bench }) => {
    await bench(
      'bounded Tailwind candidate scanning',
      { writeResult: '.benchmarks/bounded-tailwind-candidate-scanning.json' },
      () => {
        findTailwindThemeColors(adversarialTailwind)
      },
    ).run()
  })

  test('CSS custom property resolution', async ({ bench }) => {
    await bench(
      'CSS custom property resolution',
      { writeResult: '.benchmarks/css-custom-property-resolution.json' },
      async () => {
        await resolveCssVarMatches(variableUsages, {
          currentDeclarations: declarations,
          externalDeclarations: [],
        })
      },
    ).run()
  })
})
