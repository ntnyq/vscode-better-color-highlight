import {
  compositeRgba,
  contrastRatio,
  relativeLuminance,
} from '../utils/color/contrast'
import type { RgbaColor } from '../utils/color/presentation'
import type { ColorContrastEvaluation } from '../workspace-palette/types'

export function evaluateColorContrast(
  foreground: RgbaColor,
  background: RgbaColor,
): ColorContrastEvaluation {
  const clampedBackground = clampRgba(background)
  if (clampedBackground.a < 1) {
    return {
      kind: 'indeterminate',
      reason: 'translucent-background',
    }
  }

  const effectiveForeground = compositeRgba(foreground, clampedBackground)
  const ratio = contrastRatio(
    relativeLuminance(
      effectiveForeground.r,
      effectiveForeground.g,
      effectiveForeground.b,
    ),
    relativeLuminance(
      clampedBackground.r,
      clampedBackground.g,
      clampedBackground.b,
    ),
  )

  return {
    aaaLargeText: ratio >= 4.5,
    aaaNormalText: ratio >= 7,
    aaLargeText: ratio >= 3,
    aaNormalText: ratio >= 4.5,
    effectiveForeground,
    kind: 'determinate',
    ratio,
  }
}

function clampRgba({ a, b, g, r }: RgbaColor): RgbaColor {
  return {
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(b, 0, 255),
    a: clamp(a, 0, 1),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
