import { describe, expect, it } from 'vitest'
import { findContrastPairs } from '../src/contrast/find-contrast-pairs'
import type { StrategyContext } from '../src/types'

function context(languageId: string): StrategyContext {
  return { languageId }
}

describe('css contrast pairs', () => {
  it('returns final declarations with exact half-open value ranges', async () => {
    const text = `.card {
      color: blue;
      background-color: white;
      COLOR: rgb(1, 2, 3) !important;
      BACKGROUND-COLOR: #040506;
    }`

    const pairs = await findContrastPairs(text, context('css'))

    expect(pairs).toStrictEqual([
      {
        background: {
          color: 'rgb(4, 5, 6)',
          originalText: '#040506',
          range: {
            start: text.indexOf('#040506'),
            end: text.indexOf('#040506') + '#040506'.length,
          },
        },
        contextKey: `css:${text.indexOf('{')}`,
        foreground: {
          color: 'rgb(1, 2, 3)',
          originalText: 'rgb(1, 2, 3)',
          range: {
            start: text.indexOf('rgb(1, 2, 3)'),
            end: text.indexOf('rgb(1, 2, 3)') + 'rgb(1, 2, 3)'.length,
          },
        },
        variantKey: '',
      },
    ])
  })

  it('isolates rules and keeps source order through comments and strings', async () => {
    const text = [
      `.a { content: "; }"; color: red; /* ; } */ background-color: black; }`,
      `.broken { color: white;`,
      `.b { color: rgb(0, 0, 255); background-color: rgb(255, 255, 255); }`,
    ].join('\n')

    const pairs = await findContrastPairs(text, context('css'))

    expect(
      pairs.map(pair => [
        pair.foreground.originalText,
        pair.background.originalText,
      ]),
    ).toStrictEqual([
      ['red', 'black'],
      ['rgb(0, 0, 255)', 'rgb(255, 255, 255)'],
    ])
  })

  it('finds embedded style blocks and quoted inline style attributes', async () => {
    const text = `<style>.a { color: red; background-color: black }</style>
      <div style='background-color: white; color: rgb(1, 2, 3)'></div>`

    const pairs = await findContrastPairs(text, context('html'))

    expect(pairs.map(pair => pair.contextKey.split(':')[0])).toStrictEqual([
      'style',
      'inline',
    ])
    expect(pairs.map(pair => pair.foreground.originalText)).toStrictEqual([
      'red',
      'rgb(1, 2, 3)',
    ])
  })

  it('keeps outer declarations when a rule contains deterministic nested rules', async () => {
    const text = `.card {
      color: white;
      background-color: black;
      &:hover { color: black; background-color: white; }
    }`

    const pairs = await findContrastPairs(text, context('css'))

    expect(
      pairs.map(pair => [
        pair.foreground.originalText,
        pair.background.originalText,
      ]),
    ).toStrictEqual([
      ['white', 'black'],
      ['black', 'white'],
    ])
  })

  it('resolves inline CSS variables without changing source ranges', async () => {
    const text = `<div style="--fg: red; color: var(--fg); background-color: black"></div>`

    const pairs = await findContrastPairs(text, context('html'))

    expect(pairs).toMatchObject([
      {
        background: {
          color: 'rgb(0, 0, 0)',
          originalText: 'black',
        },
        foreground: {
          color: 'rgb(255, 0, 0)',
          originalText: 'var(--fg)',
          range: {
            start: text.indexOf('var(--fg)'),
            end: text.indexOf('var(--fg)') + 'var(--fg)'.length,
          },
        },
      },
    ])
  })

  it('isolates inline variable scopes and blanks host decoys', async () => {
    const text = [
      `<div data-example="--fg: lime; color: var(--fg)" style="--fg: red; color: var(--fg); background-color: black"></div>`,
      `<script>const x = '--fg: lime; color: var(--fg)'</script>`,
      `<div style="--fg: blue; color: var(--fg); background-color: white"></div>`,
    ].join('\n')

    const pairs = await findContrastPairs(text, context('html'))

    expect(pairs.map(pair => pair.foreground.color)).toStrictEqual([
      'rgb(255, 0, 0)',
      'rgb(0, 0, 255)',
    ])
    expect(pairs.map(pair => pair.foreground.range.start)).toStrictEqual([
      text.indexOf('var(--fg)', text.indexOf('style=')),
      text.lastIndexOf('var(--fg)'),
    ])
  })

  it('honors standalone named-color configuration without disabling literals', async () => {
    await expect(
      findContrastPairs('.a { color: white; background-color: black; }', {
        languageId: 'css',
        namedColorMatchMode: 'never',
      }),
    ).resolves.toStrictEqual([])

    await expect(
      findContrastPairs('.a { color: #fff; background-color: #000; }', {
        languageId: 'css',
        namedColorMatchMode: 'never',
      }),
    ).resolves.toHaveLength(1)
  })

  it('forces named colors only for syntactically established embedded CSS', async () => {
    await expect(
      findContrastPairs('<div style="color: white; background-color: black">', {
        languageId: 'html',
        namedColorMatchMode: 'never',
      }),
    ).resolves.toHaveLength(1)
  })

  it.each([
    '<div style="color: white; background-color: black; {styles}">',
    '<div style="color: white; background-color: black; {{ styles }}">',
    [
      '<div style="color: white; background-color: black; ',
      '$',
      '{theme}">',
    ].join(''),
  ])(
    'rejects quoted inline styles containing interpolation: %s',
    async text => {
      await expect(
        findContrastPairs(text, context('html')),
      ).resolves.toStrictEqual([])
    },
  )

  it('preserves fully static style and class attributes', async () => {
    const text = `<div class="bg-black text-white" style="content: '{static}'; color: white; background-color: black">`

    await expect(
      findContrastPairs(text, context('html')),
    ).resolves.toHaveLength(2)
  })

  it.each(['astro', 'svelte', 'jsx', 'typescriptreact'])(
    'rejects host interpolation markers inside CSS strings in %s',
    async languageId => {
      await expect(
        findContrastPairs(
          `<div style="content: '{theme}'; color: white; background-color: black">`,
          context(languageId),
        ),
      ).resolves.toStrictEqual([])
    },
  )

  it('rejects Vue moustaches and bound style attributes', async () => {
    await expect(
      findContrastPairs(
        `<div style="content: '{{ theme }}'; color: white; background-color: black">`,
        context('vue'),
      ),
    ).resolves.toStrictEqual([])
    await expect(
      findContrastPairs(
        `<div :style="'color: white; background-color: black'">`,
        context('vue'),
      ),
    ).resolves.toStrictEqual([])
  })

  it('preserves literal CSS string braces in pure HTML', async () => {
    await expect(
      findContrastPairs(
        `<div style="content: '{theme}'; color: white; background-color: black">`,
        context('html'),
      ),
    ).resolves.toHaveLength(1)
  })

  it.each([
    ['css', `.😀 { color: white; /* 😀 */ background-color: black; }`],
    [
      'html',
      `😀<div style="color: white; /* 😀 */ background-color: black"></div>`,
    ],
  ])(
    'preserves UTF-16 named-color ranges in %s projections',
    async (languageId, text) => {
      const pairs = await findContrastPairs(text, context(languageId))

      expect(pairs).toHaveLength(1)
      expect(pairs[0]?.foreground).toMatchObject({
        originalText: 'white',
        range: {
          start: text.indexOf('white'),
          end: text.indexOf('white') + 'white'.length,
        },
      })
      expect(pairs[0]?.background).toMatchObject({
        originalText: 'black',
        range: {
          start: text.indexOf('black'),
          end: text.indexOf('black') + 'black'.length,
        },
      })
    },
  )

  it.each([
    ['scss', '$fg: #fff; .a { color: $fg; background-color: #000; }'],
    ['less', '@fg: #fff; .a { color: @fg; background-color: #000; }'],
    ['stylus', 'fg = #fff\n.a { color: fg; background-color: #000; }'],
  ])('preserves the %s variable resolver context', async (languageId, text) => {
    await expect(
      findContrastPairs(text, context(languageId)),
    ).resolves.toMatchObject([
      {
        foreground: { color: 'rgb(255, 255, 255)' },
      },
    ])
  })

  it.each([
    '.a { color: red; background: black; }',
    '.a { color: red; background-color: linear-gradient(black, white); }',
    '.a { color: red; background-color: url(x.png) black; }',
    '.a { color: inherit; background-color: black; }',
    '.a { --color: red; background-color: black; }',
    '.a { color: red blue; background-color: black; }',
    '.a { color: unknown; background-color: black; }',
    '.a { color: red; background-color: rgb(0 0 0 / 50%); }',
    '.a { color: red; } .b { background-color: black; }',
  ])('rejects non-deterministic CSS: %s', async text => {
    await expect(
      findContrastPairs(text, context('css')),
    ).resolves.toStrictEqual([])
  })

  it.each([
    'background: black',
    'background-image: linear-gradient(black, white)',
    'background-image: url(image.png)',
    'filter: brightness(.5)',
    'opacity: .5',
    'mix-blend-mode: multiply',
    'background-blend-mode: screen',
  ])(
    'rejects rendering-dependent declarations before or after colors: %s',
    async declaration => {
      const before = `.a { ${declaration}; color: white; background-color: black; }`
      const after = `.a { color: white; background-color: black; ${declaration}; }`

      await expect(
        findContrastPairs(before, context('css')),
      ).resolves.toStrictEqual([])
      await expect(
        findContrastPairs(after, context('css')),
      ).resolves.toStrictEqual([])
    },
  )

  it('rejects markup decoys and oversized sources', async () => {
    const decoys = `<script>const x = '<div style="color:red;background-color:black">'</script>
      <div data-example='<i style="color:red;background-color:black">'></div>`

    await expect(
      findContrastPairs(decoys, context('html')),
    ).resolves.toStrictEqual([])
    await expect(
      findContrastPairs(
        `.a { color: red; background-color: black; }${' '.repeat(512 * 1024)}`,
        context('css'),
      ),
    ).resolves.toStrictEqual([])
  })
})
