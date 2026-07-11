import { describe, expect, it } from 'vitest'
import { findContrastPairs } from '../src/contrast/find-contrast-pairs'
import type { StrategyContext } from '../src/types'

function context(languageId: string): StrategyContext {
  return { languageId }
}

describe('tailwind contrast pairs', () => {
  it('pairs final same-variant utilities in one static class attribute', async () => {
    const text = `<div class="dark:bg-white dark:bg-black dark:text-red-500 dark:text-white">`

    const pairs = await findContrastPairs(text, context('html'))

    expect(pairs).toMatchObject([
      {
        background: { color: 'rgb(0, 0, 0)', originalText: 'dark:bg-black' },
        foreground: {
          color: 'rgb(255, 255, 255)',
          originalText: 'dark:text-white',
        },
        variantKey: 'dark',
      },
    ])
    expect(pairs[0]?.background.range).toStrictEqual({
      start: text.indexOf('dark:bg-black'),
      end: text.indexOf('dark:bg-black') + 'dark:bg-black'.length,
    })
  })

  it('keeps prefix and arbitrary variant chains exact', async () => {
    const text = `<div className='tw:[&>*]:bg-[#000] tw:[&>*]:text-[rgb(255_255_255)]'>`

    const pairs = await findContrastPairs(text, context('typescriptreact'))

    expect(pairs).toMatchObject([
      {
        background: { color: 'rgb(0, 0, 0)' },
        foreground: { color: 'rgb(255, 255, 255)' },
        variantKey: 'tw:[&>*]',
      },
    ])
  })

  it('resolves custom v4 theme colors and translucent foregrounds', async () => {
    const text = `<style>@theme { --color-ink: #000; --color-paper: #fff; }</style>
      <div class="bg-paper text-ink/50">`

    const pairs = await findContrastPairs(text, {
      filePath: '/repo/page.html',
      languageId: 'html',
      tailwindColorMode: 'v4',
    })

    expect(pairs).toMatchObject([
      {
        background: { color: 'rgb(255, 255, 255)' },
        foreground: { color: 'rgba(0, 0, 0, 0.5)' },
      },
    ])
  })

  it.each([
    '<div class="bg-black bg-(--missing) text-white">',
    '<div class="bg-black bg-[url(image.png)] text-white">',
    '<div class="bg-black text-white text-(--missing)">',
    '<div class="bg-black text-white text-[url(image.png)]">',
  ])(
    'does not fall back when the final raw color utility is unresolved: %s',
    async text => {
      await expect(
        findContrastPairs(text, context('html')),
      ).resolves.toStrictEqual([])
    },
  )

  it.each(['text-lg', 'text-center', 'bg-none'])(
    'keeps color winners across the reviewer non-color utility %s',
    async utility => {
      await expect(
        findContrastPairs(
          `<div class="bg-black text-white ${utility}">`,
          context('html'),
        ),
      ).resolves.toHaveLength(1)
    },
  )

  it.each([
    'text-xs',
    'text-sm',
    'text-base',
    'text-xl',
    'text-2xl',
    'text-9xl',
    'text-left',
    'text-right',
    'text-justify',
    'text-start',
    'text-end',
    'text-wrap',
    'text-nowrap',
    'text-balance',
    'text-pretty',
    'text-ellipsis',
    'text-clip',
  ])('ignores known non-color text utility %s', async utility => {
    await expect(
      findContrastPairs(
        `<div class="bg-black text-white ${utility}">`,
        context('html'),
      ),
    ).resolves.toHaveLength(1)
  })

  it.each([
    'bg-top',
    'bg-left-bottom',
    'bg-cover',
    'bg-contain',
    'bg-fixed',
    'bg-local',
    'bg-scroll',
    'bg-repeat',
    'bg-no-repeat',
    'bg-repeat-round',
    'bg-clip-content',
    'bg-origin-padding',
  ])('ignores known non-color background utility %s', async utility => {
    await expect(
      findContrastPairs(
        `<div class="bg-black text-white ${utility}">`,
        context('html'),
      ),
    ).resolves.toHaveLength(1)
  })

  it.each([
    'bg-[url(image.png)]',
    'bg-[linear-gradient(red,blue)]',
    'bg-[radial-gradient(red,blue)]',
    'bg-[conic-gradient(red,blue)]',
    'bg-[repeating-linear-gradient(red,blue)]',
    'bg-[image(url(image.png))]',
    'bg-[image-set(url(a.png)_1x)]',
    'bg-[cross-fade(url(a.png),url(b.png),50%)]',
    'bg-gradient-to-r',
    'bg-linear-to-r',
    'bg-radial',
    'bg-conic',
  ])(
    'tracks active background-image utility %s independently',
    async utility => {
      await expect(
        findContrastPairs(
          `<div class="${utility} bg-black text-white">`,
          context('html'),
        ),
      ).resolves.toStrictEqual([])
      await expect(
        findContrastPairs(
          `<div class="bg-black ${utility} text-white">`,
          context('html'),
        ),
      ).resolves.toStrictEqual([])
    },
  )

  it('lets bg-none clear active background-image state without clearing color', async () => {
    await expect(
      findContrastPairs(
        '<div class="bg-[url(image.png)] bg-black bg-none text-white">',
        context('html'),
      ),
    ).resolves.toHaveLength(1)
    await expect(
      findContrastPairs(
        '<div class="bg-black bg-[url(image.png)] bg-none text-white">',
        context('html'),
      ),
    ).resolves.toHaveLength(1)
  })

  it.each([
    'bg-[image:var(--hero)]',
    'bg-[image:url(image.png)]',
    'bg-[image:linear-gradient(red,blue)]',
  ])(
    'tracks arbitrary image type hint %s across later colors',
    async utility => {
      await expect(
        findContrastPairs(
          `<div class="${utility} bg-black text-white">`,
          context('html'),
        ),
      ).resolves.toStrictEqual([])
      await expect(
        findContrastPairs(
          `<div class="bg-black ${utility} text-white">`,
          context('html'),
        ),
      ).resolves.toStrictEqual([])
      await expect(
        findContrastPairs(
          `<div class="bg-black ${utility} bg-none text-white">`,
          context('html'),
        ),
      ).resolves.toHaveLength(1)
    },
  )

  it.each([
    'text-[16px]',
    'text-[1.25rem]',
    'text-[0]',
    'text-[50%]',
    'text-[calc(1rem_+_2px)]',
    'text-[min(1rem,_2vw)]',
    'text-[max(1rem,_2vw)]',
    'text-[clamp(1rem,_2vw,_2rem)]',
    'text-[length:var(--font-size)]',
    'text-[absolute-size:large]',
    'text-[relative-size:larger]',
  ])('ignores arbitrary font-size utility %s', async utility => {
    await expect(
      findContrastPairs(
        `<div class="bg-black text-white ${utility}">`,
        context('html'),
      ),
    ).resolves.toHaveLength(1)
  })

  it('lets arbitrary image none reset background-image state', async () => {
    await expect(
      findContrastPairs(
        '<div class="bg-[url(image.png)] bg-black bg-[image:none] text-white">',
        context('html'),
      ),
    ).resolves.toHaveLength(1)
    await expect(
      findContrastPairs(
        '<div class="bg-[url(image.png)] bg-black bg-[image:_none] text-white">',
        context('html'),
      ),
    ).resolves.toHaveLength(1)
    await expect(
      findContrastPairs(
        '<div class="bg-black bg-[image:none] bg-[url(image.png)] text-white">',
        context('html'),
      ),
    ).resolves.toStrictEqual([])
  })

  it.each([
    'bg-[position:var(--position)]',
    'bg-[length:20px]',
    'bg-[percentage:50%]',
    'bg-[size:cover]',
  ])('ignores arbitrary non-color background utility %s', async utility => {
    await expect(
      findContrastPairs(
        `<div class="bg-black text-white ${utility}">`,
        context('html'),
      ),
    ).resolves.toHaveLength(1)
  })

  it.each([
    'text-[var(--fg)]',
    'text-[color:var(--fg)]',
    'bg-[var(--surface)]',
    'bg-[color:var(--surface)]',
  ])(
    'keeps unresolved arbitrary color candidate %s conservative',
    async utility => {
      const classes = utility.startsWith('text-')
        ? `bg-black text-white ${utility}`
        : `bg-black ${utility} text-white`

      await expect(
        findContrastPairs(`<div class="${classes}">`, context('html')),
      ).resolves.toStrictEqual([])
    },
  )

  it.each([
    '<div class="bg-black/(--alpha) text-white">',
    '<div class="bg-black text-white/[var(--alpha)]">',
  ])('rejects pairs with unresolved explicit opacity: %s', async text => {
    await expect(
      findContrastPairs(text, context('html')),
    ).resolves.toStrictEqual([])
  })

  it.each([
    ['<div class="bg-black text-white ', '$', '{tone}">'].join(''),
    '<div class="bg-black text-white {tone}">',
    '<div className="bg-black text-white {{ tone }}">',
  ])(
    'rejects quoted class attributes containing interpolation: %s',
    async text => {
      await expect(
        findContrastPairs(text, context('typescriptreact')),
      ).resolves.toStrictEqual([])
    },
  )

  it('rejects template-like source languages', async () => {
    const text = '<div class="bg-black text-white">'

    await expect(
      findContrastPairs(text, context('php')),
    ).resolves.toStrictEqual([])
    await expect(
      findContrastPairs(text, context('handlebars')),
    ).resolves.toStrictEqual([])
  })

  it.each(['html', 'htm', 'vue', 'svelte', 'astro', 'jsx', 'typescriptreact'])(
    'preserves real static attributes in %s',
    async languageId => {
      await expect(
        findContrastPairs(
          '<div class="bg-black text-white">',
          context(languageId),
        ),
      ).resolves.toHaveLength(1)
    },
  )

  it.each([
    `<div class="bg-white dark:text-black">`,
    `<div class="hover:bg-white dark:text-black">`,
    `<div class="bg-white text-lg">`,
    `<div class="bg-gradient-to-r from-black text-white">`,
    ['<div class={`bg-white text-', '$', '{tone}', '`}>'].join(''),
    `<div class="bg-[rgb(0_0_0) text-white">`,
    `<script>const x = '<div class="bg-black text-white">'</script>`,
    `<div class="bg-black/50 text-white">`,
  ])('rejects non-deterministic utilities: %s', async text => {
    await expect(
      findContrastPairs(text, context('html')),
    ).resolves.toStrictEqual([])
  })
})
