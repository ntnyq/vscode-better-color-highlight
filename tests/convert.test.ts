import { describe, expect, it } from 'vitest'
import {
  hexToRgb,
  hexARGBToRgb,
  hslToRgb,
  hwbToRgb,
  labToRgb,
  lchToRgb,
  oklabToRgb,
  oklchToRgb,
  rgbString,
} from '../src/utils/color'

describe(hexToRgb, () => {
  it('parses 3-digit hex', () => {
    expect(hexToRgb('#f00')).toStrictEqual({ r: 255, g: 0, b: 0 })
  })

  it('parses 6-digit hex', () => {
    expect(hexToRgb('#ff0000')).toStrictEqual({ r: 255, g: 0, b: 0 })
  })

  it('parses 4-digit hex with alpha (RGBA)', () => {
    expect(hexToRgb('#f00f')).toStrictEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it('parses 8-digit hex with alpha (RGBA)', () => {
    expect(hexToRgb('#ff000080')).toStrictEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 128 / 255,
    })
  })

  it('returns null for invalid hex', () => {
    expect(hexToRgb('#ff')).toBeNull()
    expect(hexToRgb('#ff00000000')).toBeNull()
  })

  it('handles 0x prefix', () => {
    expect(hexToRgb('0xff0000')).toStrictEqual({ r: 255, g: 0, b: 0 })
  })
})

describe(hexARGBToRgb, () => {
  it('parses 8-digit hex as ARGB', () => {
    const result = hexARGBToRgb('#80ff0000')
    expect(result).toBeDefined()
    expect(result!.r).toBe(255)
    expect(result!.g).toBe(0)
    expect(result!.b).toBe(0)
    expect(result!.a).toBeCloseTo(128 / 255, 2)
  })

  it('falls back to normal for non-alpha hex', () => {
    expect(hexARGBToRgb('#ff0000')).toStrictEqual({ r: 255, g: 0, b: 0 })
  })
})

describe(hslToRgb, () => {
  it('converts pure red', () => {
    const [r, g, b] = hslToRgb(0, 1, 0.5)
    expect(r).toBe(255)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })

  it('converts pure green', () => {
    const [r, g, b] = hslToRgb(120, 1, 0.5)
    expect(r).toBe(0)
    expect(g).toBe(255)
    expect(b).toBe(0)
  })

  it('converts pure blue', () => {
    const [r, g, b] = hslToRgb(240, 1, 0.5)
    expect(r).toBe(0)
    expect(g).toBe(0)
    expect(b).toBe(255)
  })

  it('handles zero saturation (gray)', () => {
    const [r, g, b] = hslToRgb(0, 0, 0.5)
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(128)
  })
})

describe(hwbToRgb, () => {
  it('converts pure red', () => {
    const [r, g, b] = hwbToRgb(0, 0, 0)
    expect(r).toBe(255)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })

  it('returns gray when w+b >= 1', () => {
    const [r, g, b] = hwbToRgb(0, 0.5, 0.5)
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(128)
  })
})

describe(labToRgb, () => {
  it('converts white', () => {
    const [r, g, b] = labToRgb(100, 0, 0)
    expect(r).toBe(255)
    expect(g).toBe(255)
    expect(b).toBe(255)
  })

  it('converts black', () => {
    expect(labToRgb(0, 0, 0)).toStrictEqual([0, 0, 0])
  })

  it('converts perceptual mid-gray', () => {
    expect(labToRgb(50, 0, 0)).toStrictEqual([119, 119, 119])
  })
})

describe(lchToRgb, () => {
  it('converts white', () => {
    const [r, g, b] = lchToRgb(100, 0, 0)
    expect(r).toBe(255)
    expect(g).toBe(255)
    expect(b).toBe(255)
  })
})

describe(oklabToRgb, () => {
  it('converts white', () => {
    const [r, g, b] = oklabToRgb(1, 0, 0)
    expect(r).toBe(255)
    expect(g).toBe(255)
    expect(b).toBe(255)
  })

  it('converts black', () => {
    const [r, g, b] = oklabToRgb(0, 0, 0)
    expect(r).toBe(0)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })
})

describe(oklchToRgb, () => {
  it('converts white', () => {
    const [r, g, b] = oklchToRgb(1, 0, 0)
    expect(r).toBe(255)
    expect(g).toBe(255)
    expect(b).toBe(255)
  })
})

describe(rgbString, () => {
  it('formats rgb() without alpha', () => {
    expect(rgbString(255, 0, 0)).toBe('rgb(255, 0, 0)')
  })

  it('formats rgba() with alpha', () => {
    expect(rgbString(255, 0, 0, 0.5)).toBe('rgba(255, 0, 0, 0.5)')
  })

  it('uses rgb() when alpha is 1', () => {
    expect(rgbString(255, 0, 0, 1)).toBe('rgb(255, 0, 0)')
  })

  it('clamps values', () => {
    expect(rgbString(300, -10, 128)).toBe('rgb(255, 0, 128)')
  })
})
