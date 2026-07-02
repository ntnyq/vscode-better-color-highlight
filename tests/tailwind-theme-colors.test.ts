import { describe, expect, it } from 'vitest'
import { findTailwindThemeColors } from '../src/strategies/tailwind-theme-colors'

describe(findTailwindThemeColors, () => {
  it('finds default Tailwind theme color utilities', () => {
    const result = findTailwindThemeColors('class="bg-red-500 text-sky-300"')

    expect(result).toStrictEqual([
      { start: 7, end: 17, color: 'rgb(239, 68, 68)' },
      { start: 18, end: 30, color: 'rgb(125, 211, 252)' },
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
})
