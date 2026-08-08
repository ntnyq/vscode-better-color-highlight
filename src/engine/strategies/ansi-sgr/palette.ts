import type { AnsiPaletteOverrides } from '../../detection'

export type RgbChannels = readonly [number, number, number]

const XTERM_ANSI_PALETTE: readonly RgbChannels[] = [
  [0, 0, 0],
  [205, 0, 0],
  [0, 205, 0],
  [205, 205, 0],
  [0, 0, 238],
  [205, 0, 205],
  [0, 205, 205],
  [229, 229, 229],
  [127, 127, 127],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [92, 92, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
]

const COLOR_CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const

const ANSI_PALETTE_NAMES = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const satisfies readonly (keyof AnsiPaletteOverrides)[]

/** Resolve a conventional xterm 256-color palette index. */
export function resolveAnsiPaletteColor(
  index: number,
  overrides?: AnsiPaletteOverrides,
): RgbChannels | null {
  if (!Number.isInteger(index) || index < 0 || index > 255) {
    return null
  }
  if (index < XTERM_ANSI_PALETTE.length) {
    const override = overrides?.[ANSI_PALETTE_NAMES[index]]
    const overrideColor = override ? parseHexColor(override) : null
    if (overrideColor) {
      return overrideColor
    }
    return XTERM_ANSI_PALETTE[index]
  }
  if (index < 232) {
    const offset = index - 16
    return [
      COLOR_CUBE_LEVELS[Math.floor(offset / 36)],
      COLOR_CUBE_LEVELS[Math.floor(offset / 6) % 6],
      COLOR_CUBE_LEVELS[offset % 6],
    ]
  }

  const level = 8 + (index - 232) * 10
  return [level, level, level]
}

function parseHexColor(value: string): RgbChannels | null {
  const match = value.match(
    /^#(?<red>[\da-f]{2})(?<green>[\da-f]{2})(?<blue>[\da-f]{2})$/iu,
  )
  if (!match?.groups) {
    return null
  }

  return [
    Number.parseInt(match.groups.red, 16),
    Number.parseInt(match.groups.green, 16),
    Number.parseInt(match.groups.blue, 16),
  ]
}
