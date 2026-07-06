import { describe, expect, it } from 'vitest'
import { getColorPresentations } from '../src/utils/color/presentation'

describe(getColorPresentations, () => {
  it('formats rgba colors as hex, rgb, hsl, oklch, and alpha text', () => {
    expect(getColorPresentations('rgba(255, 0, 0, 0.5)')).toStrictEqual({
      alpha: '50%',
      hex: '#ff000080',
      hsl: 'hsl(0 100% 50% / 0.5)',
      oklch: 'oklch(62.8% 0.258 29.2 / 0.5)',
      rgb: 'rgba(255, 0, 0, 0.5)',
    })
  })
})
