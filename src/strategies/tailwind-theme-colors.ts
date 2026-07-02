import type { ColorMatch } from '../types'
import { hexToRgb, rgbString } from '../utils/color'

/**
 * Default Tailwind shade keys supported by the static theme palette.
 */
const TAILWIND_COLOR_SHADES = [
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
] as const

/**
 * Supported Tailwind default color shade key.
 */
type TailwindColorShade = (typeof TAILWIND_COLOR_SHADES)[number]

/**
 * Hex colors for one Tailwind color scale keyed by shade.
 */
type TailwindColorScale = Record<TailwindColorShade, string>

/**
 * Tailwind utility prefixes whose suffix is interpreted as a color reference.
 *
 * Keep longer prefixes before shorter ones so border-x and ring-offset are not
 * resolved as border or ring utilities.
 */
const COLOR_UTILITY_PREFIXES = [
  'ring-offset',
  'decoration',
  'placeholder',
  'border-x',
  'border-y',
  'border-s',
  'border-e',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'outline',
  'shadow',
  'accent',
  'border',
  'caret',
  'divide',
  'stroke',
  'text',
  'ring',
  'fill',
  'from',
  'via',
  'bg',
  'to',
] as const

/**
 * Alternation pattern used by the utility-anchor regex.
 */
const COLOR_UTILITY_PREFIX_PATTERN = COLOR_UTILITY_PREFIXES.join('|')

/**
 * Finds the actual color utility segment without trying to parse variant
 * prefixes in the regex itself.
 */
const UTILITY_ANCHOR_REGEX = new RegExp(
  String.raw`(?:${COLOR_UTILITY_PREFIX_PATTERN})-` +
    String.raw`[a-z]+(?:-[a-z]+)*(?:-[0-9]{2,3})?(?:/(?:\[[^\]\s"'<>]+\]|[.\d]+%?))?`,
  'gu',
)

/**
 * Character matcher for token text that can be part of a utility or variant.
 */
const WORD_OR_HYPHEN_REGEX = /[\w-]/u

/**
 * Characters that make an arbitrary variant segment unsafe to consume.
 */
const INVALID_ARBITRARY_VARIANT_CHAR_REGEX = /[\]\s"'<>]/u

/**
 * Tailwind solid color utilities that do not use shade suffixes.
 */
const SOLID_COLORS = {
  black: '#000000',
  white: '#ffffff',
} as const

/**
 * Static copy of Tailwind's default color palette.
 */
const TAILWIND_THEME_COLORS: Record<string, TailwindColorScale> = {
  slate: {
    '50': '#f8fafc',
    '100': '#f1f5f9',
    '200': '#e2e8f0',
    '300': '#cbd5e1',
    '400': '#94a3b8',
    '500': '#64748b',
    '600': '#475569',
    '700': '#334155',
    '800': '#1e293b',
    '900': '#0f172a',
    '950': '#020617',
  },
  gray: {
    '50': '#f9fafb',
    '100': '#f3f4f6',
    '200': '#e5e7eb',
    '300': '#d1d5db',
    '400': '#9ca3af',
    '500': '#6b7280',
    '600': '#4b5563',
    '700': '#374151',
    '800': '#1f2937',
    '900': '#111827',
    '950': '#030712',
  },
  zinc: {
    '50': '#fafafa',
    '100': '#f4f4f5',
    '200': '#e4e4e7',
    '300': '#d4d4d8',
    '400': '#a1a1aa',
    '500': '#71717a',
    '600': '#52525b',
    '700': '#3f3f46',
    '800': '#27272a',
    '900': '#18181b',
    '950': '#09090b',
  },
  neutral: {
    '50': '#fafafa',
    '100': '#f5f5f5',
    '200': '#e5e5e5',
    '300': '#d4d4d4',
    '400': '#a3a3a3',
    '500': '#737373',
    '600': '#525252',
    '700': '#404040',
    '800': '#262626',
    '900': '#171717',
    '950': '#0a0a0a',
  },
  stone: {
    '50': '#fafaf9',
    '100': '#f5f5f4',
    '200': '#e7e5e4',
    '300': '#d6d3d1',
    '400': '#a8a29e',
    '500': '#78716c',
    '600': '#57534e',
    '700': '#44403c',
    '800': '#292524',
    '900': '#1c1917',
    '950': '#0c0a09',
  },
  red: {
    '50': '#fef2f2',
    '100': '#fee2e2',
    '200': '#fecaca',
    '300': '#fca5a5',
    '400': '#f87171',
    '500': '#ef4444',
    '600': '#dc2626',
    '700': '#b91c1c',
    '800': '#991b1b',
    '900': '#7f1d1d',
    '950': '#450a0a',
  },
  orange: {
    '50': '#fff7ed',
    '100': '#ffedd5',
    '200': '#fed7aa',
    '300': '#fdba74',
    '400': '#fb923c',
    '500': '#f97316',
    '600': '#ea580c',
    '700': '#c2410c',
    '800': '#9a3412',
    '900': '#7c2d12',
    '950': '#431407',
  },
  amber: {
    '50': '#fffbeb',
    '100': '#fef3c7',
    '200': '#fde68a',
    '300': '#fcd34d',
    '400': '#fbbf24',
    '500': '#f59e0b',
    '600': '#d97706',
    '700': '#b45309',
    '800': '#92400e',
    '900': '#78350f',
    '950': '#451a03',
  },
  yellow: {
    '50': '#fefce8',
    '100': '#fef9c3',
    '200': '#fef08a',
    '300': '#fde047',
    '400': '#facc15',
    '500': '#eab308',
    '600': '#ca8a04',
    '700': '#a16207',
    '800': '#854d0e',
    '900': '#713f12',
    '950': '#422006',
  },
  lime: {
    '50': '#f7fee7',
    '100': '#ecfccb',
    '200': '#d9f99d',
    '300': '#bef264',
    '400': '#a3e635',
    '500': '#84cc16',
    '600': '#65a30d',
    '700': '#4d7c0f',
    '800': '#3f6212',
    '900': '#365314',
    '950': '#1a2e05',
  },
  green: {
    '50': '#f0fdf4',
    '100': '#dcfce7',
    '200': '#bbf7d0',
    '300': '#86efac',
    '400': '#4ade80',
    '500': '#22c55e',
    '600': '#16a34a',
    '700': '#15803d',
    '800': '#166534',
    '900': '#14532d',
    '950': '#052e16',
  },
  emerald: {
    '50': '#ecfdf5',
    '100': '#d1fae5',
    '200': '#a7f3d0',
    '300': '#6ee7b7',
    '400': '#34d399',
    '500': '#10b981',
    '600': '#059669',
    '700': '#047857',
    '800': '#065f46',
    '900': '#064e3b',
    '950': '#022c22',
  },
  teal: {
    '50': '#f0fdfa',
    '100': '#ccfbf1',
    '200': '#99f6e4',
    '300': '#5eead4',
    '400': '#2dd4bf',
    '500': '#14b8a6',
    '600': '#0d9488',
    '700': '#0f766e',
    '800': '#115e59',
    '900': '#134e4a',
    '950': '#042f2e',
  },
  cyan: {
    '50': '#ecfeff',
    '100': '#cffafe',
    '200': '#a5f3fc',
    '300': '#67e8f9',
    '400': '#22d3ee',
    '500': '#06b6d4',
    '600': '#0891b2',
    '700': '#0e7490',
    '800': '#155e75',
    '900': '#164e63',
    '950': '#083344',
  },
  sky: {
    '50': '#f0f9ff',
    '100': '#e0f2fe',
    '200': '#bae6fd',
    '300': '#7dd3fc',
    '400': '#38bdf8',
    '500': '#0ea5e9',
    '600': '#0284c7',
    '700': '#0369a1',
    '800': '#075985',
    '900': '#0c4a6e',
    '950': '#082f49',
  },
  blue: {
    '50': '#eff6ff',
    '100': '#dbeafe',
    '200': '#bfdbfe',
    '300': '#93c5fd',
    '400': '#60a5fa',
    '500': '#3b82f6',
    '600': '#2563eb',
    '700': '#1d4ed8',
    '800': '#1e40af',
    '900': '#1e3a8a',
    '950': '#172554',
  },
  indigo: {
    '50': '#eef2ff',
    '100': '#e0e7ff',
    '200': '#c7d2fe',
    '300': '#a5b4fc',
    '400': '#818cf8',
    '500': '#6366f1',
    '600': '#4f46e5',
    '700': '#4338ca',
    '800': '#3730a3',
    '900': '#312e81',
    '950': '#1e1b4b',
  },
  violet: {
    '50': '#f5f3ff',
    '100': '#ede9fe',
    '200': '#ddd6fe',
    '300': '#c4b5fd',
    '400': '#a78bfa',
    '500': '#8b5cf6',
    '600': '#7c3aed',
    '700': '#6d28d9',
    '800': '#5b21b6',
    '900': '#4c1d95',
    '950': '#2e1065',
  },
  purple: {
    '50': '#faf5ff',
    '100': '#f3e8ff',
    '200': '#e9d5ff',
    '300': '#d8b4fe',
    '400': '#c084fc',
    '500': '#a855f7',
    '600': '#9333ea',
    '700': '#7e22ce',
    '800': '#6b21a8',
    '900': '#581c87',
    '950': '#3b0764',
  },
  fuchsia: {
    '50': '#fdf4ff',
    '100': '#fae8ff',
    '200': '#f5d0fe',
    '300': '#f0abfc',
    '400': '#e879f9',
    '500': '#d946ef',
    '600': '#c026d3',
    '700': '#a21caf',
    '800': '#86198f',
    '900': '#701a75',
    '950': '#4a044e',
  },
  pink: {
    '50': '#fdf2f8',
    '100': '#fce7f3',
    '200': '#fbcfe8',
    '300': '#f9a8d4',
    '400': '#f472b6',
    '500': '#ec4899',
    '600': '#db2777',
    '700': '#be185d',
    '800': '#9d174d',
    '900': '#831843',
    '950': '#500724',
  },
  rose: {
    '50': '#fff1f2',
    '100': '#ffe4e6',
    '200': '#fecdd3',
    '300': '#fda4af',
    '400': '#fb7185',
    '500': '#f43f5e',
    '600': '#e11d48',
    '700': '#be123c',
    '800': '#9f1239',
    '900': '#881337',
    '950': '#4c0519',
  },
}

/**
 * Detect Tailwind theme color utility classes.
 *
 * @param text - The document text to scan
 * @returns Array of color matches found in Tailwind color utilities
 */
export function findTailwindThemeColors(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const match of text.matchAll(UTILITY_ANCHOR_REGEX)) {
    const utilityStart = match.index ?? 0
    const start = findCandidateStart(text, utilityStart)

    if (start === null) continue

    const end = utilityStart + match[0].length
    const candidate = text.slice(start, end)
    const color = resolveCandidateColor(candidate)

    if (!color) continue

    matches.push({
      start,
      end,
      color,
    })
  }

  return matches
}

/**
 * Find the start of a utility candidate including optional variant prefixes.
 *
 * @param text - Full document text
 * @param utilityStart - Offset where the actual utility prefix starts
 * @returns Candidate start offset, or null when the utility is embedded in a word
 */
function findCandidateStart(text: string, utilityStart: number): number | null {
  let start = utilityStart

  if (text[start - 1] === '!') start--

  while (text[start - 1] === ':') {
    const segmentStart = findVariantSegmentStart(text, start - 1)

    if (segmentStart === null) break

    start = segmentStart

    if (text[start - 1] === '!') start--
  }

  if (start > 0 && WORD_OR_HYPHEN_REGEX.test(text[start - 1])) {
    return null
  }

  return start
}

/**
 * Find the start of a Tailwind variant segment ending before a colon.
 *
 * @param text - Full document text
 * @param separator - Offset of the trailing variant separator colon
 * @returns Variant segment start, or null when the previous text is not a variant
 */
function findVariantSegmentStart(
  text: string,
  separator: number,
): number | null {
  if (separator <= 0) return null

  if (text[separator - 1] === ']') {
    const start = text.lastIndexOf('[', separator - 1)
    if (start === -1) return null

    const value = text.slice(start + 1, separator - 1)
    if (!value || INVALID_ARBITRARY_VARIANT_CHAR_REGEX.test(value)) {
      return null
    }

    return start
  }

  let start = separator

  while (start > 0 && WORD_OR_HYPHEN_REGEX.test(text[start - 1])) {
    start--
  }

  return start === separator ? null : start
}

/**
 * Resolve a candidate token to a Tailwind theme color.
 *
 * @param candidate - Class-like token from source text
 * @returns Resolved CSS rgb or rgba string, or null when not a color utility
 */
function resolveCandidateColor(candidate: string): string | null {
  const utilityStart = findUtilityStart(candidate)
  const utility = candidate.slice(utilityStart).replace(/^!/u, '')

  for (const prefix of COLOR_UTILITY_PREFIXES) {
    const colorValue = resolveUtilityColor(utility, prefix)
    if (colorValue) return colorValue
  }

  return null
}

/**
 * Find the start offset of the actual utility after variant prefixes.
 *
 * @param candidate - Class-like token that may include variants
 * @returns Offset where the utility segment starts inside the candidate token
 */
function findUtilityStart(candidate: string): number {
  let bracketDepth = 0
  let lastSeparator = -1

  for (let index = 0; index < candidate.length; index++) {
    const char = candidate[index]

    if (char === '[') bracketDepth++
    else if (char === ']') bracketDepth = Math.max(bracketDepth - 1, 0)
    else if (char === ':' && bracketDepth === 0) lastSeparator = index
  }

  return lastSeparator + 1
}

/**
 * Resolve a Tailwind color utility with a specific utility prefix.
 *
 * @param utility - Utility segment without variant prefixes
 * @param prefix - Tailwind color utility prefix to test
 * @returns Resolved CSS rgb or rgba string, or null when the prefix does not match
 */
function resolveUtilityColor(
  utility: string,
  prefix: (typeof COLOR_UTILITY_PREFIXES)[number],
): string | null {
  const marker = `${prefix}-`
  if (!utility.startsWith(marker)) return null

  const colorReference = utility.slice(marker.length)
  const { alpha, value } = splitOpacityModifier(colorReference)
  const hex = resolveThemeColor(value)

  if (!hex) return null

  return hexToRgbString(hex, alpha)
}

/**
 * Split a Tailwind color reference from its opacity modifier.
 *
 * @param value - Color reference, optionally followed by a slash opacity
 * @returns Color reference value and parsed alpha channel when present
 */
function splitOpacityModifier(value: string): {
  value: string
  alpha?: number
} {
  const slashIndex = value.indexOf('/')
  if (slashIndex === -1) return { value }

  const alpha = parseOpacityModifier(value.slice(slashIndex + 1))

  return {
    value: value.slice(0, slashIndex),
    ...(alpha === undefined ? {} : { alpha }),
  }
}

/**
 * Parse a Tailwind slash opacity modifier.
 *
 * @param value - Raw opacity modifier after the slash
 * @returns Alpha value from 0 to 1, or undefined when invalid
 */
function parseOpacityModifier(value: string): number | undefined {
  const isArbitraryValue = value.startsWith('[') && value.endsWith(']')
  const normalized = isArbitraryValue ? value.slice(1, -1) : value

  if (normalized.endsWith('%')) {
    const numericValue = Number(normalized.slice(0, -1))
    if (!Number.isFinite(numericValue)) return undefined

    return clampAlpha(numericValue / 100)
  }

  const numericValue = Number(normalized)

  if (!Number.isFinite(numericValue)) return undefined

  if (isArbitraryValue || normalized.includes('.')) {
    return clampAlpha(numericValue)
  }

  return clampAlpha(numericValue / 100)
}

/**
 * Resolve a Tailwind theme color reference to a hex color.
 *
 * @param value - Color reference such as red-500 or white
 * @returns Hex color string, or null when the reference is not in the default theme
 */
function resolveThemeColor(value: string): string | null {
  if (isSolidColor(value)) return SOLID_COLORS[value]

  const shadeSeparator = value.lastIndexOf('-')
  if (shadeSeparator === -1) return null

  const colorName = value.slice(0, shadeSeparator)
  const shade = value.slice(shadeSeparator + 1)
  const scale = TAILWIND_THEME_COLORS[colorName]

  if (!scale || !isTailwindColorShade(shade)) return null

  return scale[shade]
}

/**
 * Check whether a value is one of Tailwind's solid color names.
 *
 * @param value - Color reference to check
 * @returns Whether the value is black or white
 */
function isSolidColor(value: string): value is keyof typeof SOLID_COLORS {
  return value in SOLID_COLORS
}

/**
 * Check whether a value is a supported Tailwind color shade.
 *
 * @param value - Shade text to check
 * @returns Whether the value is a default Tailwind shade key
 */
function isTailwindColorShade(value: string): value is TailwindColorShade {
  return (TAILWIND_COLOR_SHADES as readonly string[]).includes(value)
}

/**
 * Convert a hex color and optional alpha channel to CSS color text.
 *
 * @param hex - Hex color string to convert
 * @param alpha - Optional alpha channel from 0 to 1
 * @returns CSS rgb or rgba string, or null when the hex color is invalid
 */
function hexToRgbString(hex: string, alpha?: number): string | null {
  const result = hexToRgb(hex)
  if (!result) return null

  return rgbString(result.r, result.g, result.b, alpha)
}

/**
 * Clamp an alpha channel into the valid CSS alpha range.
 *
 * @param value - Raw alpha channel
 * @returns Alpha channel clamped between 0 and 1
 */
function clampAlpha(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}
