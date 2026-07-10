import { describe, expect, it } from 'vitest'
import { resolveTailwindColorValue } from '../src/strategies/tailwind-theme/color'
import { createTailwindBasePalette } from '../src/strategies/tailwind-theme/palette-v4'

describe(createTailwindBasePalette, () => {
  it('keeps the Tailwind v3 palette in auto mode without a v4 signal', () => {
    const palette = createTailwindBasePalette('auto', false)

    expect(palette.get('red-500')).toBe('#ef4444')
    expect(palette.get('sky-300')).toBe('#7dd3fc')
  })

  it('selects official Tailwind v4 OKLCH values when forced', () => {
    const palette = createTailwindBasePalette('v4', false)

    expect(palette.get('red-500')).toBe('oklch(63.7% 0.237 25.331)')
  })

  it('selects Tailwind v4 in auto mode when a v4 signal is present', () => {
    const palette = createTailwindBasePalette('auto', true)

    expect(palette.get('red-500')).toBe('oklch(63.7% 0.237 25.331)')
  })

  it.each(['mauve', 'olive', 'mist', 'taupe'])(
    'includes the v4 %s family',
    family => {
      const palette = createTailwindBasePalette('v4', false)

      expect(palette.get(`${family}-500`)).toMatch(/^oklch\(/u)
    },
  )

  it('includes solid colors and excludes non-color and deprecated exports', () => {
    const palette = createTailwindBasePalette('v4', false)

    expect(palette.get('black')).toBe('#000')
    expect(palette.get('white')).toBe('#fff')
    expect(palette.has('inherit')).toBe(false)
    expect(palette.has('current')).toBe(false)
    expect(palette.has('transparent')).toBe(false)
    expect(palette.has('lightBlue-500')).toBe(false)
    expect(palette.has('warmGray-500')).toBe(false)
  })
})

describe(resolveTailwindColorValue, () => {
  it.each([
    ['#ef4444', 'rgb(239, 68, 68)'],
    ['black', 'rgb(0, 0, 0)'],
    ['oklch(63.7% 0.237 25.331)', 'rgb(251, 44, 54)'],
  ])('resolves %s through the existing color parsers', async (value, color) => {
    await expect(resolveTailwindColorValue(value)).resolves.toBe(color)
  })

  it('rejects non-color values', async () => {
    await expect(
      resolveTailwindColorValue('var(--missing)'),
    ).resolves.toBeNull()
  })
})
