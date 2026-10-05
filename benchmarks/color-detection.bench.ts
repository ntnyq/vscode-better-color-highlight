import { describe, test } from 'vitest'
import { findAndroidColors } from '../src/engine/strategies/android-colors'
import { parseAndroidResourceDocument } from '../src/engine/strategies/android-resources/parser'
import { findColorFunctions } from '../src/engine/strategies/color-functions'
import { collectCssVarDeclarations } from '../src/engine/strategies/css-vars/parser'
import { resolveCssVarMatches } from '../src/engine/strategies/css-vars/resolver'
import { findHexRGBA } from '../src/engine/strategies/hex'
import { findSwiftColors } from '../src/engine/strategies/swift-colors'
import { findTailwindThemeColors } from '../src/engine/strategies/tailwind-theme'
import { findUnityColors } from '../src/engine/strategies/unity-colors'

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
const comparisonColors = Array.from(
  { length: 400 },
  (_, index) =>
    `.math-${index} { color: oklch(from oklch(.65 .2 30 / .8) clamp(.2, l, .8) min(c * .9, .15) calc(h + max(15, 30))); background: alpha(from red / min(alpha, clamp(0, .5, 1))); }`,
).join('\n')
const oversizedComparison = `min(${'1,'.repeat(130)}1)`
const deepComparison = `${'min('.repeat(40)}r${', 1)'.repeat(40)}`
const longComparison = `max(${' '.repeat(4096)}r, 0)`
const malformedComparisons = Array.from(
  { length: 100 },
  () =>
    `rgb(from red ${oversizedComparison} g b); rgb(from red ${deepComparison} g b); rgb(from red ${longComparison} g b);`,
).join('\n')
const unclosedComparisons = `rgb(from red ${'min('.repeat(10_000)}r; alpha(from blue / max(.2, .5))`
const absoluteMathColors = Array.from(
  { length: 400 },
  (_, index) =>
    `.absolute-${index} { color: rgb(min(255, 128) calc(32 * 2) 0 / clamp(0, .5, 1)); background: hsl(calc(60 + 60), min(100%, 80%), 50%, calc(1 / 2)); border-color: color-mix(in srgb, color(srgb max(.2, .5) 0 0), oklch(clamp(.2, .65, .8) .2 30)); }`,
).join('\n')
const malformedAbsoluteMath = Array.from(
  { length: 100 },
  () =>
    `rgb(${oversizedComparison} 0 0); hsl(${'min('.repeat(40)}60${', 1)'.repeat(40)} 100% 50%); color(srgb max(${' '.repeat(4096)}.5, 0) 0 0);`,
).join('\n')
const unclosedAbsoluteMath = `rgb(${'min('.repeat(10_000)}1; rgb(max(64, 128) 0 0 / .5)`
const excessAbsoluteArguments = `rgb(${'1 '.repeat(10_000)}); hsl(${'1%,'.repeat(10_000)}); rgb(min(64, 128) 0 0)`
const longChain = `:root { ${Array.from({ length: 200 }, (_, index) => `--v${index}: var(--v${index + 1});`).join(' ')} --v200: red; } .x { color: rgb(from var(--v0) r g b); }`
const chainDeclarations = collectCssVarDeclarations(longChain, {
  trustedSelectors: [':root'],
})
const nativeColors =
  'Color(1f, 0f, 0f, .5f); Color(red: 1, green: 0, blue: 0);'.repeat(400)
const unityColors = Array.from(
  { length: 400 },
  (_, index) =>
    `var tint${index} = new UnityEngine.Color(.15f, .4f, .9f, .75F);\nvar overlay${index} = new UnityEngine.Color32(r: ${index % 256}, g: 128, b: 224, a: 192);`,
).join('\n')
const malformedUnityColors = `${'new UnityEngine.Color('.repeat(10_000)}0f`

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

  test('CSS comparison math expressions', async ({ bench }) => {
    await bench(
      'CSS comparison math expressions',
      { writeResult: '.benchmarks/css-comparison-math-expressions.json' },
      () => {
        findColorFunctions(comparisonColors)
      },
    ).run()
  })

  test('bounded malformed CSS comparison math', async ({ bench }) => {
    await bench(
      'bounded malformed CSS comparison math',
      { writeResult: '.benchmarks/bounded-malformed-css-comparison-math.json' },
      () => {
        findColorFunctions(malformedComparisons)
      },
    ).run()
  })

  test('unclosed CSS comparison math', async ({ bench }) => {
    await bench(
      'unclosed CSS comparison math',
      { writeResult: '.benchmarks/unclosed-css-comparison-math.json' },
      () => {
        findColorFunctions(unclosedComparisons)
      },
    ).run()
  })

  test('absolute CSS math expressions', async ({ bench }) => {
    await bench(
      'absolute CSS math expressions',
      { writeResult: '.benchmarks/absolute-css-math-expressions.json' },
      () => {
        findColorFunctions(absoluteMathColors)
      },
    ).run()
  })

  test('bounded malformed absolute CSS math', async ({ bench }) => {
    await bench(
      'bounded malformed absolute CSS math',
      { writeResult: '.benchmarks/bounded-malformed-absolute-css-math.json' },
      () => {
        findColorFunctions(malformedAbsoluteMath)
      },
    ).run()
  })

  test('unclosed absolute CSS math', async ({ bench }) => {
    await bench(
      'unclosed absolute CSS math',
      { writeResult: '.benchmarks/unclosed-absolute-css-math.json' },
      () => {
        findColorFunctions(unclosedAbsoluteMath)
      },
    ).run()
  })

  test('excess absolute CSS math arguments', async ({ bench }) => {
    await bench(
      'excess absolute CSS math arguments',
      { writeResult: '.benchmarks/excess-absolute-css-math-arguments.json' },
      () => {
        findColorFunctions(excessAbsoluteArguments)
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

  test('Unity component constructors', async ({ bench }) => {
    await bench(
      'Unity component constructors',
      { writeResult: '.benchmarks/unity-component-constructors.json' },
      () => {
        findUnityColors(unityColors)
      },
    ).run()
  })

  test('unclosed Unity constructors', async ({ bench }) => {
    await bench(
      'unclosed Unity constructors',
      { writeResult: '.benchmarks/unclosed-unity-constructors.json' },
      () => {
        findUnityColors(malformedUnityColors)
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
