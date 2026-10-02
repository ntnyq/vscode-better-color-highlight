import { evaluateColorCalc } from './calc'
import {
  convertCssColor,
  createCssColor,
  normalizeHue,
  type ColorChannels,
  type CssColorSpace,
  type CssColorValue,
  type MissingColorComponents,
} from './space'

const SPACES = new Set<CssColorSpace>([
  'srgb',
  'srgb-linear',
  'display-p3',
  'display-p3-linear',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d50',
  'xyz-d65',
])

/**
 * Separate relative-color components while keeping nested functions intact.
 */
function tokenizeArguments(source: string): string[] | null {
  const tokens: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index <= source.length; index++) {
    const char = source[index]
    if (char === '(') {
      depth++
    }
    if (char === ')' && --depth < 0) {
      return null
    }
    if (
      depth === 0 &&
      (index === source.length || /\s/u.test(char) || char === '/')
    ) {
      if (index > start) {
        tokens.push(source.slice(start, index))
      }
      if (char === '/') {
        tokens.push('/')
      }
      start = index + 1
    }
  }
  return depth === 0 ? tokens : null
}

/**
 * Resolve static relative CSS colors in the function's processing space.
 */
export function parseRelativeColor(
  name: string,
  args: string,
  parseOrigin: (source: string) => CssColorValue | null,
): CssColorValue | null {
  const tokens = tokenizeArguments(args)
  if (!tokens || tokens.shift()?.toLowerCase() !== 'from') {
    return null
  }
  const origin = parseOrigin(tokens.shift() ?? '')
  if (!origin) {
    return null
  }
  let space: CssColorSpace
  switch (name) {
    case 'rgb':
    case 'rgba': {
      space = 'srgb'
      break
    }
    case 'hsl':
    case 'hsla': {
      space = 'hsl'
      break
    }
    case 'hwb':
    case 'lab':
    case 'lch':
    case 'oklab':
    case 'oklch': {
      space = name
      break
    }
    case 'alpha': {
      space = origin.space
      break
    }
    case 'color': {
      const specified = tokens.shift()?.toLowerCase()
      const candidate = specified === 'xyz' ? 'xyz-d65' : specified
      if (!SPACES.has(candidate as CssColorSpace)) {
        return null
      }
      space = candidate as CssColorSpace
      break
    }
    default: {
      return null
    }
  }
  // A relative color may restore saturation/chroma, so a specified hue must
  // survive even when it was powerless in the origin color.
  const converted =
    name === 'alpha'
      ? origin
      : convertCssColor(origin, space, { preservePowerless: true })
  const names = getChannelNames(space)
  const scales = getChannelScales(name, space)
  const values = new Map<string, number>()
  const missingNames = new Set<string>()
  if (name !== 'alpha') {
    for (const [index, channel] of names.entries()) {
      let value = converted.channels[index] * scales[index]
      if (channel === 'h') {
        value = normalizeHue(value)
      }
      if (converted.missing[index]) {
        value = 0
        missingNames.add(channel)
      }
      values.set(channel, value)
    }
  }
  values.set(
    'alpha',
    converted.missing[3] ? 0 : Math.min(1, Math.max(0, converted.alpha)),
  )
  if (converted.missing[3]) {
    missingNames.add('alpha')
  }
  const count = name === 'alpha' ? 0 : 3
  if (
    tokens.length !== count &&
    (tokens.length !== count + 2 || tokens[count] !== '/')
  ) {
    return null
  }
  const components = tokens.slice(0, count)
  const alphaSource = tokens[count + 1] ?? 'alpha'
  const channels: ColorChannels = [...converted.channels]
  const missing: MissingColorComponents = [...converted.missing]
  let alpha = converted.alpha
  for (const [index, component] of [...components, alphaSource].entries()) {
    const isAlpha = index === count
    const channelIndex = isAlpha ? 3 : index
    const normalized = component.toLowerCase()
    missing[channelIndex] =
      normalized === 'none' || missingNames.has(normalized)
    let value = 0
    if (!missing[channelIndex]) {
      const parsed = evaluateColorCalc(normalized, values)
      if (!parsed) {
        return null
      }
      const isHue = !isAlpha && names[index] === 'h'
      if (
        (parsed.unit === 'angle' && !isHue) ||
        (parsed.unit === 'percentage' && isHue)
      ) {
        return null
      }
      value = parsed.value
      if (parsed.unit === 'percentage') {
        const percentageScale = isAlpha
          ? 1
          : getPercentageScale(space, index, scales[index])
        value = (value / 100) * percentageScale
      }
      if (!isAlpha) {
        value /= scales[index]
      }
    }
    if (isAlpha) {
      alpha = Math.min(1, Math.max(0, value))
    } else {
      channels[index] = value
    }
  }
  return createCssColor(space, channels, alpha, missing)
}

/**
 * Channel identifiers and scales in CSS relative processing spaces.
 */
function getChannelNames(space: CssColorSpace): readonly string[] {
  if (space === 'hsl') {
    return ['h', 's', 'l']
  }
  if (space === 'hwb') {
    return ['h', 'w', 'b']
  }
  if (space === 'lab' || space === 'oklab') {
    return ['l', 'a', 'b']
  }
  if (space === 'lch' || space === 'oklch') {
    return ['l', 'c', 'h']
  }
  if (space.startsWith('xyz')) {
    return ['x', 'y', 'z']
  }
  return ['r', 'g', 'b']
}

function getChannelScales(name: string, space: CssColorSpace): ColorChannels {
  if (name === 'rgb' || name === 'rgba') {
    return [255, 255, 255]
  }
  if (space === 'hsl' || space === 'hwb') {
    return [1, 100, 100]
  }
  return [1, 1, 1]
}

function getPercentageScale(
  space: CssColorSpace,
  index: number,
  fallback: number,
): number {
  if (space === 'lab') {
    return index === 0 ? 100 : 125
  }
  if (space === 'lch') {
    return index === 0 ? 100 : 150
  }
  if (space === 'oklab' || space === 'oklch') {
    return index === 0 ? 1 : 0.4
  }
  return fallback
}
