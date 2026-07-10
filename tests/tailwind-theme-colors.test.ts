import { describe, expect, it } from 'vitest'
import { findTailwindThemeColors } from '../src/strategies/tailwind-theme-colors'
import { findTailwindColorUtilities } from '../src/strategies/tailwind-theme/utility'

function ranges(text: string) {
  return findTailwindColorUtilities(text).map(utility => ({
    text: text.slice(utility.start, utility.end),
    kind: utility.kind,
    value: utility.value,
    opacity: utility.opacity,
  }))
}

describe(findTailwindThemeColors, () => {
  it('finds default Tailwind theme color utilities', () => {
    const result = findTailwindThemeColors('class="bg-red-500 text-sky-300"')

    expect(result).toStrictEqual([
      { start: 7, end: 17, color: 'rgb(239, 68, 68)' },
      { start: 18, end: 30, color: 'rgb(125, 211, 252)' },
    ])
  })

  it('preserves the v3 palette when auto mode has no v4 signal', () => {
    const result = findTailwindThemeColors('bg-red-500', {
      hasV4Signal: false,
      mode: 'auto',
    })

    expect(result).toStrictEqual([
      { start: 0, end: 10, color: 'rgb(239, 68, 68)' },
    ])
  })

  it('uses official v4 palette colors when v4 mode is forced', () => {
    const result = findTailwindThemeColors('bg-red-500 bg-mauve-500', {
      hasV4Signal: false,
      mode: 'v4',
    })

    expect(result).toStrictEqual([
      { start: 0, end: 10, color: 'rgb(251, 44, 54)' },
      { start: 11, end: 23, color: 'rgb(121, 105, 123)' },
    ])
  })

  it('finds variants and opacity modifiers', () => {
    const result = findTailwindThemeColors(
      'class="dark:hover:border-white/75 focus:ring-emerald-600/[.31]"',
    )

    expect(result).toStrictEqual([
      {
        start: 7,
        end: 33,
        color: 'rgba(255, 255, 255, 0.75)',
      },
      {
        start: 34,
        end: 62,
        color: 'rgba(5, 150, 105, 0.31)',
      },
    ])
  })

  it('treats bare opacity modifiers as percentages', () => {
    const result = findTailwindThemeColors('class="bg-red-500/1"')

    expect(result).toStrictEqual([
      { start: 7, end: 19, color: 'rgba(239, 68, 68, 0.01)' },
    ])
  })

  it('finds gradient and shadow color utilities', () => {
    const result = findTailwindThemeColors(
      '@apply from-purple-400 via-fuchsia-500 shadow-slate-950;',
    )

    expect(result).toStrictEqual([
      { start: 7, end: 22, color: 'rgb(192, 132, 252)' },
      { start: 23, end: 38, color: 'rgb(217, 70, 239)' },
      { start: 39, end: 55, color: 'rgb(2, 6, 23)' },
    ])
  })

  it('skips color names that are not Tailwind color utilities', () => {
    const result = findTailwindThemeColors('red-500 text-lg border-solid')

    expect(result).toStrictEqual([])
  })

  it('does not backtrack through colon-heavy non-utility text', () => {
    const text = `${'a:'.repeat(5000)}x`
    const start = performance.now()

    const result = findTailwindThemeColors(text)
    const duration = performance.now() - start

    expect(result).toStrictEqual([])
    expect(duration).toBeLessThan(75)
  })

  it('parses variants, prefix variants, and both important forms structurally', () => {
    const text = [
      'dark:hover:!bg-red-500',
      '[&>*]:fill-sky-300',
      'tw:hover:ring-mauve-500!',
    ].join(' ')

    expect(ranges(text)).toStrictEqual([
      {
        text: 'dark:hover:!bg-red-500',
        kind: 'named',
        value: 'red-500',
        opacity: undefined,
      },
      {
        text: '[&>*]:fill-sky-300',
        kind: 'named',
        value: 'sky-300',
        opacity: undefined,
      },
      {
        text: 'tw:hover:ring-mauve-500!',
        kind: 'named',
        value: 'mauve-500',
        opacity: undefined,
      },
    ])
  })

  it('parses all color utility groups and complete token ranges', () => {
    const text =
      'from-red-500 via-sky-300 to-blue-500 stroke-red-500 fill-blue-500 shadow-black ring-white ring-offset-red-500 border-x-green-500 decoration-pink-500'

    expect(
      findTailwindColorUtilities(text).map(({ start, end }) =>
        text.slice(start, end),
      ),
    ).toStrictEqual(text.split(' '))
  })

  it('parses v4 shadow color utilities and structural variants', () => {
    const text = [
      'group-hover/foo:inset-shadow-red-500',
      'not-[.foo]:inset-ring-sky-300',
      'supports-[display:grid]:text-shadow-blue-500',
      'hover:drop-shadow-emerald-600',
    ].join(' ')

    expect(
      findTailwindColorUtilities(text).map(({ start, end }) =>
        text.slice(start, end),
      ),
    ).toStrictEqual(text.split(' '))
    expect(findTailwindThemeColors(text)).toHaveLength(4)
  })

  it('decodes bracket colors and retains escaped underscores', () => {
    const text = String.raw`bg-[#50d71e] text-[oklch(70%_0.2_40)] border-[color(display-p3_1_0_0)] fill-[rebecca\_purple]`

    expect(
      ranges(text).map(({ kind, value }) => ({ kind, value })),
    ).toStrictEqual([
      { kind: 'arbitrary', value: '#50d71e' },
      { kind: 'arbitrary', value: 'oklch(70% 0.2 40)' },
      { kind: 'arbitrary', value: 'color(display-p3 1 0 0)' },
      { kind: 'arbitrary', value: 'rebecca_purple' },
    ])
  })

  it('strips the color arbitrary type hint before parsing', () => {
    expect(
      findTailwindThemeColors('bg-[color:#fff] text-[color:oklch(70%_0.2_40)]'),
    ).toStrictEqual([
      { start: 0, end: 15, color: 'rgb(255, 255, 255)' },
      { start: 16, end: 46, color: 'rgb(255, 103, 40)' },
    ])
  })

  it('tracks nested brackets and functions without truncating the token', () => {
    const text = '[&:has([data-state=open])]:bg-[rgb(1_2_3)]'

    expect(ranges(text)).toStrictEqual([
      {
        text,
        kind: 'arbitrary',
        value: 'rgb(1 2 3)',
        opacity: undefined,
      },
    ])
    expect(findTailwindThemeColors(text)).toStrictEqual([
      { start: 0, end: text.length, color: 'rgb(1, 2, 3)' },
    ])
  })

  it('parses parenthesized properties and opacity forms', () => {
    const text =
      'bg-(--color-brand)/25 text-red-500/[31%] border-[#fff]/.5 fill-blue-500/(--opacity)'

    expect(ranges(text)).toStrictEqual([
      {
        text: 'bg-(--color-brand)/25',
        kind: 'property',
        value: '--color-brand',
        opacity: '25',
      },
      {
        text: 'text-red-500/[31%]',
        kind: 'named',
        value: 'red-500',
        opacity: '[31%]',
      },
      {
        text: 'border-[#fff]/.5',
        kind: 'arbitrary',
        value: '#fff',
        opacity: '.5',
      },
      {
        text: 'fill-blue-500/(--opacity)',
        kind: 'named',
        value: 'blue-500',
        opacity: '(--opacity)',
      },
    ])
  })

  it('rejects dynamic, malformed, negative, and embedded candidates', () => {
    const text = [
      ['bg-$', '{color}'].join(''),
      'bg-[rgb(1_2_3)',
      'bg-[theme(colors.red.500)]',
      '-bg-red-500',
      'debug-red-500',
      'hover::bg-red-500',
      '[&:hover:bg-red-500',
      '!bg-red-500!',
    ].join(' ')

    expect(findTailwindColorUtilities(text)).toStrictEqual([])
    expect(
      findTailwindThemeColors('debug-red-500 bg-red-500suffix'),
    ).toStrictEqual([])
    expect(findTailwindThemeColors('bg-[rgb(1 2 3)]')).toStrictEqual([])
  })

  it('multiplies slash opacity with the color existing alpha', () => {
    expect(findTailwindThemeColors('bg-[#ff000080]/50')).toStrictEqual([
      { start: 0, end: 17, color: 'rgba(255, 0, 0, 0.251)' },
    ])
  })

  it('retains legacy matching inside CSS class selectors', () => {
    expect(findTailwindThemeColors('.bg-red-500:hover {}')).toStrictEqual([
      { start: 1, end: 11, color: 'rgb(239, 68, 68)' },
    ])
  })

  it.each([
    ['.bg-red-500:nth-child(2n) {}', 'bg-red-500'],
    ['.bg-red-500:not(.foo) {}', 'bg-red-500'],
    ['.bg-red-500:is(.foo,.bar) {}', 'bg-red-500'],
    ['.foo#main.bg-red-500:not(.bar) {}', 'bg-red-500'],
    [String.raw`.hover\:bg-red-500:hover {}`, String.raw`hover\:bg-red-500`],
  ])('extracts the complete class utility from %s', (text, classToken) => {
    const start = text.indexOf(classToken)

    expect(findTailwindThemeColors(text)).toStrictEqual([
      {
        start,
        end: start + classToken.length,
        color: 'rgb(239, 68, 68)',
      },
    ])
  })

  it('retains v3 matches in compound selectors and chained punctuation', () => {
    const text =
      '.foo.bg-red-500:hover#active.text-sky-300::before,button.fill-blue-500 {}'

    expect(findTailwindThemeColors(text)).toStrictEqual([
      {
        start: text.indexOf('bg-red-500'),
        end: text.indexOf('bg-red-500') + 'bg-red-500'.length,
        color: 'rgb(239, 68, 68)',
      },
      {
        start: text.indexOf('text-sky-300'),
        end: text.indexOf('text-sky-300') + 'text-sky-300'.length,
        color: 'rgb(125, 211, 252)',
      },
      {
        start: text.indexOf('fill-blue-500'),
        end: text.indexOf('fill-blue-500') + 'fill-blue-500'.length,
        color: 'rgb(59, 130, 246)',
      },
    ])
  })

  it('keeps selector restarts outside decimals, escapes, and arbitrary values', () => {
    const text = String.raw`.foo\.bg-red-500.bar.bg-red-500/.5:hover .x.bg-[rgb(1.5_2_3)] .y.bg-[color(display-p3_1_0.5_0)]`

    expect(ranges(text)).toStrictEqual([
      {
        text: 'bg-red-500/.5',
        kind: 'named',
        value: 'red-500',
        opacity: '.5',
      },
      {
        text: 'bg-[rgb(1.5_2_3)]',
        kind: 'arbitrary',
        value: 'rgb(1.5 2 3)',
        opacity: undefined,
      },
      {
        text: 'bg-[color(display-p3_1_0.5_0)]',
        kind: 'arbitrary',
        value: 'color(display-p3 1 0.5 0)',
        opacity: undefined,
      },
    ])
  })

  it('restarts across punctuation-heavy selectors in linear time', () => {
    const text = `${'.foo#id:hover'.repeat(10_000)}.bg-red-500 {}`
    const start = performance.now()

    expect(findTailwindThemeColors(text)).toStrictEqual([
      {
        start: text.indexOf('bg-red-500'),
        end: text.indexOf('bg-red-500') + 'bg-red-500'.length,
        color: 'rgb(239, 68, 68)',
      },
    ])
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('handles colon and bracket-heavy input in linear time', () => {
    const text = [`${'a:'.repeat(20_000)}x`, `${'['.repeat(20_000)}x`].join(' ')
    const start = performance.now()

    expect(findTailwindColorUtilities(text)).toStrictEqual([])
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('resolves custom themes, arbitrary colors, properties, and opacity', () => {
    const text = `
      @theme { --color-brand-muted: #50d71e; }
      <div class="bg-brand-muted/50 text-[oklch(70%_0.2_40)] fill-(--color-brand-muted)! bg-[#50d71e]/[31%]"></div>
    `
    const result = findTailwindThemeColors(text, { mode: 'v4' })

    expect(result).not.toBeInstanceOf(Promise)
    expect(result).toStrictEqual([
      expect.objectContaining({
        color: 'rgba(80, 215, 30, 0.5)',
      }),
      expect.objectContaining({ color: expect.stringMatching(/^rgb\(/u) }),
      expect.objectContaining({ color: 'rgb(80, 215, 30)' }),
      expect.objectContaining({ color: 'rgba(80, 215, 30, 0.31)' }),
    ])
  })

  it('resolves HTML style themes for utilities outside the style element', () => {
    const text = `<style>
      @theme { --color-brand-muted: #50d71e; }
    </style>
    <div class="tw:hover:bg-mauve-500! fill-(--color-brand-muted)"></div>`

    expect(
      findTailwindThemeColors(text, {
        filePath: '/workspace/index.html',
        languageId: 'html',
      }),
    ).toStrictEqual([
      {
        start: text.indexOf('tw:hover:bg-mauve-500!'),
        end:
          text.indexOf('tw:hover:bg-mauve-500!') +
          'tw:hover:bg-mauve-500!'.length,
        color: 'rgb(121, 105, 123)',
      },
      {
        start: text.indexOf('fill-(--color-brand-muted)'),
        end:
          text.indexOf('fill-(--color-brand-muted)') +
          'fill-(--color-brand-muted)'.length,
        color: 'rgb(80, 215, 30)',
      },
    ])
  })

  it('does not highlight TSX utilities from embedded style string decoys', () => {
    const text = `const el=<div/>; const x="<style>@theme{--color-decoy:red}</style>"; <div class="bg-decoy"/>`

    expect(
      findTailwindThemeColors(text, {
        filePath: '/workspace/App.tsx',
        languageId: 'typescriptreact',
      }),
    ).toStrictEqual([])
  })

  it('returns a promise only for trusted configured theme loading', async () => {
    const sync = findTailwindThemeColors('bg-red-500', {
      languageId: 'html',
      tailwindStylesheetPaths: ['theme.css'],
      workspaceIsTrusted: false,
    })
    const asyncResult = findTailwindThemeColors('bg-red-500', {
      filePath: '/repo/page.html',
      languageId: 'html',
      tailwindStylesheetPaths: ['theme.css'],
      workspaceIsTrusted: true,
    })

    expect(sync).not.toBeInstanceOf(Promise)
    expect(asyncResult).toBeInstanceOf(Promise)
    await expect(asyncResult).resolves.toStrictEqual([
      { start: 0, end: 10, color: 'rgb(239, 68, 68)' },
    ])
  })

  it('deduplicates matches by range and color', () => {
    const result = findTailwindThemeColors('bg-red-500 bg-red-500')

    expect(result).toHaveLength(2)
    expect(
      new Set(result.map(match => `${match.start}:${match.end}:${match.color}`))
        .size,
    ).toBe(2)
  })
})
