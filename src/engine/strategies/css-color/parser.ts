import { hexToRgb, rgbString } from '../../../shared/color'
import { NAMED_COLORS } from '../../../shared/constants'
import {
  convertCssColor,
  createCssColor,
  getHueChannelIndex,
  isPolarColorSpace,
  normalizeHue,
  type ColorChannels,
  type CssColorSpace,
  type CssColorValue,
  type MissingColorComponents,
} from './space'

type HueInterpolationMethod = 'decreasing' | 'increasing' | 'longer' | 'shorter'

interface FunctionCandidate {
  readonly end: number
  readonly name: string
  readonly source: string
  readonly start: number
}

interface MixItem {
  readonly color: CssColorValue
  readonly percentage?: number
}

interface WeightedColor {
  readonly color: CssColorValue
  readonly percentage: number
}

interface ParsedComponent {
  readonly missing: boolean
  readonly value: number
}

const NUMBER_SOURCE = String.raw`[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?`
const MAX_COLOR_EXPRESSION_DEPTH = 32
const PERCENTAGE_REGEX = new RegExp(`^(?<value>${NUMBER_SOURCE})%$`, 'iu')
const ANGLE_REGEX = new RegExp(
  `^(?<value>${NUMBER_SOURCE})(?<unit>deg|grad|rad|turn)?$`,
  'iu',
)
const NUMBER_REGEX = new RegExp(`^${NUMBER_SOURCE}$`, 'iu')
const MIX_PERCENTAGE_SUFFIX_REGEX = new RegExp(
  `^(?<color>.+)\\s+(?<percentage>${NUMBER_SOURCE}%)$`,
  'iu',
)
const MIX_PERCENTAGE_PREFIX_REGEX = new RegExp(
  `^(?<percentage>${NUMBER_SOURCE}%)\\s+(?<color>.+)$`,
  'iu',
)
const SUPPORTED_COLOR_FUNCTIONS: ReadonlySet<string> = new Set([
  'color',
  'color-mix',
  'hsl',
  'hsla',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'rgb',
  'rgba',
])
const PREDEFINED_COLOR_SPACES: ReadonlySet<CssColorSpace> = new Set([
  'a98-rgb',
  'display-p3',
  'display-p3-linear',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'prophoto-rgb',
  'rec2020',
  'srgb',
  'srgb-linear',
  'xyz-d50',
  'xyz-d65',
])
const COLOR_FUNCTION_SPACES: ReadonlySet<CssColorSpace> = new Set([
  'a98-rgb',
  'display-p3',
  'display-p3-linear',
  'prophoto-rgb',
  'rec2020',
  'srgb',
  'srgb-linear',
  'xyz-d50',
  'xyz-d65',
])

/** Scan complete, balanced CSS color function ranges. */
export function scanCssColorFunctions(text: string): FunctionCandidate[] {
  const candidates: FunctionCandidate[] = []
  const stack: {
    readonly name?: string
    readonly start?: number
    readonly supportedDepth: number
  }[] = []
  let supportedDepth = 0

  for (let index = 0; index < text.length; index++) {
    if (text[index] === '(') {
      const head = getFunctionHead(text, index)
      if (head && SUPPORTED_COLOR_FUNCTIONS.has(head.name)) {
        supportedDepth++
      }
      stack.push({ ...head, supportedDepth })
      continue
    }
    if (text[index] !== ')') {
      continue
    }
    const entry = stack.pop()
    if (entry?.name && SUPPORTED_COLOR_FUNCTIONS.has(entry.name)) {
      supportedDepth--
    }
    if (
      !entry?.name ||
      entry.start === undefined ||
      !SUPPORTED_COLOR_FUNCTIONS.has(entry.name) ||
      entry.supportedDepth > MAX_COLOR_EXPRESSION_DEPTH
    ) {
      continue
    }
    candidates.push({
      end: index + 1,
      name: entry.name,
      source: text.slice(entry.start, index + 1),
      start: entry.start,
    })
  }

  return candidates
}

function getFunctionHead(
  text: string,
  openIndex: number,
): { readonly name: string; readonly start: number } | undefined {
  let start = openIndex
  while (start > 0 && /[-\w]/u.test(text[start - 1])) {
    start--
  }
  const name = text.slice(start, openIndex)
  return /^[a-z][\w-]*$/iu.test(name)
    ? { name: name.toLowerCase(), start }
    : undefined
}

/** Parse one complete static CSS color expression. */
export function parseCssColorExpression(source: string): CssColorValue | null {
  return parseCssColorExpressionAtDepth(source, 0)
}

function parseCssColorExpressionAtDepth(
  source: string,
  depth: number,
): CssColorValue | null {
  if (depth > MAX_COLOR_EXPRESSION_DEPTH) {
    return null
  }
  const normalized = source.trim()
  if (!normalized) {
    return null
  }

  const hex = parseHexColor(normalized)
  if (hex) {
    return hex
  }

  const keyword = parseColorKeyword(normalized)
  if (keyword) {
    return keyword
  }

  const envelope = parseFunctionEnvelope(normalized)
  if (!envelope) {
    return null
  }

  switch (envelope.name) {
    case 'rgb':
    case 'rgba': {
      return parseRgbFunction(envelope.args)
    }
    case 'hsl':
    case 'hsla': {
      return parseHslFunction(envelope.args)
    }
    case 'hwb': {
      return parseHwbArguments(envelope.args)
    }
    case 'lab':
    case 'lch':
    case 'oklab':
    case 'oklch': {
      return parseLabLikeFunction(envelope.name, envelope.args)
    }
    case 'color': {
      return parseColorSpaceFunction(envelope.args)
    }
    case 'color-mix': {
      return parseColorMixFunction(envelope.args, depth)
    }
    default: {
      return null
    }
  }
}

/** Parse one complete hwb() expression. */
export function parseHwbColor(source: string): CssColorValue | null {
  const envelope = parseFunctionEnvelope(source.trim())
  return envelope?.name === 'hwb' ? parseHwbArguments(envelope.args) : null
}

/** Format a parsed color for the extension's decoration contract. */
export function formatCssColor(color: CssColorValue): string {
  const srgb = convertCssColor(color, 'srgb')
  const channels = srgb.channels.map((channel, index) =>
    srgb.missing[index] ? 0 : channel,
  ) as ColorChannels
  const alpha = srgb.missing[3] ? 0 : srgb.alpha
  return rgbString(
    channels[0] * 255,
    channels[1] * 255,
    channels[2] * 255,
    alpha,
  )
}

function parseFunctionEnvelope(
  source: string,
): { readonly args: string; readonly name: string } | null {
  const head = source.match(/^(?<name>[a-z][\w-]*)\(/iu)
  const name = head?.groups?.name?.toLowerCase()
  if (!head || !name) {
    return null
  }

  const openIndex = head[0].length - 1
  const closeIndex = findMatchingParenthesis(source, openIndex)
  if (closeIndex !== source.length - 1) {
    return null
  }

  return { args: source.slice(openIndex + 1, closeIndex), name }
}

function findMatchingParenthesis(text: string, openIndex: number): number {
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = openIndex; index < text.length; index++) {
    const character = text[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '(') {
      depth++
    } else if (character === ')' && --depth === 0) {
      return index
    }
  }

  return -1
}

function parseHexColor(source: string): CssColorValue | null {
  if (!/^#[a-f\d]{3,4}(?:[a-f\d]{2}){0,2}$/iu.test(source)) {
    return null
  }
  const color = hexToRgb(source)
  return color
    ? createCssColor(
        'srgb',
        [color.r / 255, color.g / 255, color.b / 255],
        color.a ?? 1,
      )
    : null
}

function parseColorKeyword(source: string): CssColorValue | null {
  const normalized = source.toLowerCase()
  if (normalized === 'transparent') {
    return createCssColor('srgb', [0, 0, 0], 0)
  }

  const channels = NAMED_COLORS.get(normalized)
  return channels
    ? createCssColor('srgb', [
        channels[0] / 255,
        channels[1] / 255,
        channels[2] / 255,
      ])
    : null
}

function parseRgbFunction(args: string): CssColorValue | null {
  if (args.includes(',')) {
    return parseLegacyRgb(args)
  }

  const parsed = parseModernArguments(args)
  if (!parsed) {
    return null
  }
  const channels = parsed.channels.map(parseRgbComponent)
  return createColorFromComponents('srgb', channels, parsed.alpha)
}

function parseLegacyRgb(args: string): CssColorValue | null {
  if (args.includes('/')) {
    return null
  }
  const parts = args.split(',').map(part => part.trim())
  if (parts.length !== 3 && parts.length !== 4) {
    return null
  }

  const percentageChannels = parts
    .slice(0, 3)
    .map(part => parsePercentage(part, false))
  const numberChannels = parts.slice(0, 3).map(part => parseNumber(part, false))
  let channels: (ParsedComponent | null)[] | null = null
  if (percentageChannels.every(Boolean)) {
    channels = percentageChannels
  } else if (numberChannels.every(Boolean)) {
    channels = numberChannels.map(component =>
      component
        ? { missing: component.missing, value: component.value / 255 }
        : null,
    )
  }
  if (!channels || channels.some(component => !component)) {
    return null
  }

  const alpha = parts[3] ? parseAlpha(parts[3], false) : defaultAlpha()
  return alpha
    ? createColorFromComponents('srgb', channels as ParsedComponent[], alpha)
    : null
}

function parseHslFunction(args: string): CssColorValue | null {
  if (args.includes(',')) {
    return parseLegacyHsl(args)
  }
  const parsed = parseModernArguments(args)
  if (!parsed) {
    return null
  }
  const channels = [
    parseAngle(parsed.channels[0]),
    parsePercentLikeComponent(parsed.channels[1]),
    parsePercentLikeComponent(parsed.channels[2]),
  ]
  return createColorFromComponents('hsl', channels, parsed.alpha)
}

function parseLegacyHsl(args: string): CssColorValue | null {
  if (args.includes('/')) {
    return null
  }
  const parts = args.split(',').map(part => part.trim())
  if (parts.length !== 3 && parts.length !== 4) {
    return null
  }
  const channels = [
    parseAngle(parts[0], false),
    parsePercentage(parts[1], false),
    parsePercentage(parts[2], false),
  ]
  const alpha = parts[3] ? parseAlpha(parts[3], false) : defaultAlpha()
  return alpha ? createColorFromComponents('hsl', channels, alpha) : null
}

function parseHwbArguments(args: string): CssColorValue | null {
  if (args.includes(',')) {
    return null
  }
  const parsed = parseModernArguments(args)
  if (!parsed) {
    return null
  }
  const channels = [
    parseAngle(parsed.channels[0]),
    parsePercentLikeComponent(parsed.channels[1]),
    parsePercentLikeComponent(parsed.channels[2]),
  ]
  return createColorFromComponents('hwb', channels, parsed.alpha)
}

function parseLabLikeFunction(
  space: 'lab' | 'lch' | 'oklab' | 'oklch',
  args: string,
): CssColorValue | null {
  if (args.includes(',')) {
    return null
  }
  const parsed = parseModernArguments(args)
  if (!parsed) {
    return null
  }

  const channels = parsed.channels.map((channel, index) => {
    if ((space === 'lch' || space === 'oklch') && index === 2) {
      return parseAngle(channel)
    }
    const percentageScale = getLabPercentageScale(space, index)
    return parseNumberOrPercentage(channel, percentageScale)
  })
  return createColorFromComponents(space, channels, parsed.alpha)
}

function getLabPercentageScale(
  space: 'lab' | 'lch' | 'oklab' | 'oklch',
  index: number,
): number {
  if (index === 0) {
    return space === 'lab' || space === 'lch' ? 100 : 1
  }
  if (space === 'lab') {
    return 125
  }
  if (space === 'lch') {
    return 150
  }
  return 0.4
}

function parseColorSpaceFunction(args: string): CssColorValue | null {
  if (args.includes(',')) {
    return null
  }
  const normalizedArgs = args.trim()
  const firstWhitespace = normalizedArgs.search(/\s/u)
  if (firstWhitespace === -1) {
    return null
  }
  const rawSpace = normalizedArgs.slice(0, firstWhitespace).toLowerCase()
  const space = rawSpace === 'xyz' ? 'xyz-d65' : rawSpace
  if (!COLOR_FUNCTION_SPACES.has(space as CssColorSpace)) {
    return null
  }

  const parsed = parseModernArguments(
    normalizedArgs.slice(firstWhitespace).trim(),
  )
  if (!parsed) {
    return null
  }
  const channels = parsed.channels.map(channel =>
    parseNumberOrPercentage(channel, 1),
  )
  return createColorFromComponents(
    space as CssColorSpace,
    channels,
    parsed.alpha,
  )
}

function parseModernArguments(args: string): {
  readonly alpha: ParsedComponent
  readonly channels: readonly [string, string, string]
} | null {
  const slashParts = splitTopLevel(args, '/')
  if (slashParts.length > 2) {
    return null
  }
  const channels = slashParts[0].trim().split(/\s+/u)
  if (channels.length !== 3) {
    return null
  }
  if (slashParts.length === 2 && !slashParts[1].trim()) {
    return null
  }
  const alpha =
    slashParts.length === 2
      ? parseAlpha(slashParts[1].trim(), true)
      : defaultAlpha()
  if (!alpha) {
    return null
  }
  return {
    alpha,
    channels: channels as [string, string, string],
  }
}

function parseRgbComponent(source: string): ParsedComponent | null {
  const percentage = parsePercentage(source)
  if (percentage) {
    return percentage
  }
  const number = parseNumber(source)
  return number ? { ...number, value: number.value / 255 } : null
}

function parseAngle(source: string, allowNone = true): ParsedComponent | null {
  if (allowNone && source.toLowerCase() === 'none') {
    return { missing: true, value: 0 }
  }
  const match = source.match(ANGLE_REGEX)
  if (!match?.groups) {
    return null
  }
  const value = Number(match.groups.value)
  switch (match.groups.unit?.toLowerCase()) {
    case 'grad': {
      return { missing: false, value: (value * 360) / 400 }
    }
    case 'rad': {
      return { missing: false, value: (value * 180) / Math.PI }
    }
    case 'turn': {
      return { missing: false, value: value * 360 }
    }
    default: {
      return { missing: false, value }
    }
  }
}

function parseNumber(source: string, allowNone = true): ParsedComponent | null {
  if (allowNone && source.toLowerCase() === 'none') {
    return { missing: true, value: 0 }
  }
  return NUMBER_REGEX.test(source)
    ? { missing: false, value: Number(source) }
    : null
}

function parsePercentage(
  source: string,
  allowNone = true,
): ParsedComponent | null {
  if (allowNone && source.toLowerCase() === 'none') {
    return { missing: true, value: 0 }
  }
  const match = source.match(PERCENTAGE_REGEX)
  return match?.groups
    ? { missing: false, value: Number(match.groups.value) / 100 }
    : null
}

function parseNumberOrPercentage(
  source: string,
  percentageScale: number,
): ParsedComponent | null {
  const percentage = parsePercentage(source)
  if (percentage) {
    return { ...percentage, value: percentage.value * percentageScale }
  }
  return parseNumber(source)
}

function parsePercentLikeComponent(source: string): ParsedComponent | null {
  const percentage = parsePercentage(source)
  if (percentage) {
    return percentage
  }
  const number = parseNumber(source)
  return number ? { ...number, value: number.value / 100 } : null
}

function parseAlpha(
  source: string,
  allowNone: boolean,
): ParsedComponent | null {
  const percentage = parsePercentage(source, allowNone)
  if (percentage) {
    return { ...percentage, value: clamp(percentage.value, 0, 1) }
  }
  const number = parseNumber(source, allowNone)
  return number ? { ...number, value: clamp(number.value, 0, 1) } : null
}

function defaultAlpha(): ParsedComponent {
  return { missing: false, value: 1 }
}

function createColorFromComponents(
  space: CssColorSpace,
  components: readonly (ParsedComponent | null)[],
  alpha: ParsedComponent,
): CssColorValue | null {
  if (components.length !== 3 || components.some(component => !component)) {
    return null
  }
  const parsed = components as ParsedComponent[]
  if (
    !parsed.every(component => Number.isFinite(component.value)) ||
    !Number.isFinite(alpha.value)
  ) {
    return null
  }
  return createCssColor(
    space,
    parsed.map(component => component.value) as ColorChannels,
    alpha.value,
    [parsed[0].missing, parsed[1].missing, parsed[2].missing, alpha.missing],
  )
}

function parseColorMixFunction(
  args: string,
  depth: number,
): CssColorValue | null {
  const parts = splitTopLevel(args, ',').map(part => part.trim())
  if (parts.some(part => !part)) {
    return null
  }

  const interpolation = parseInterpolationMethod(parts[0])
  const itemParts = interpolation ? parts.slice(1) : parts
  const space = interpolation?.space ?? 'oklab'
  const hueMethod = interpolation?.hueMethod ?? 'shorter'
  if (itemParts.length < 2) {
    return null
  }

  const items = itemParts.map(item => parseMixItem(item, depth + 1))
  if (items.some(item => !item)) {
    return null
  }
  const weighted = normalizeMixPercentages(items as MixItem[])
  if (!weighted) {
    return null
  }
  if (weighted.items.length === 0) {
    return createCssColor(space, [0, 0, 0], 0)
  }

  let result = convertCssColor(weighted.items[0].color, space)
  let combinedPercentage = weighted.items[0].percentage
  for (const item of weighted.items.slice(1)) {
    const nextCombined = combinedPercentage + item.percentage
    result = interpolateColors(
      result,
      convertCssColor(item.color, space),
      item.percentage / nextCombined,
      hueMethod,
    )
    combinedPercentage = nextCombined
  }

  return {
    ...result,
    alpha: result.alpha * weighted.alphaMultiplier,
  }
}

function parseInterpolationMethod(source: string): {
  readonly hueMethod: HueInterpolationMethod
  readonly space: CssColorSpace
} | null {
  const match = source.match(
    /^(?:in)\s+(?<space>[\w-]+)(?:\s+(?<method>shorter|longer|increasing|decreasing)\s+hue)?$/iu,
  )
  const rawSpace = match?.groups?.space?.toLowerCase()
  if (!rawSpace) {
    return null
  }
  const space = rawSpace === 'xyz' ? 'xyz-d65' : rawSpace
  if (!PREDEFINED_COLOR_SPACES.has(space as CssColorSpace)) {
    return null
  }
  const hueMethod = (match?.groups?.method?.toLowerCase() ??
    'shorter') as HueInterpolationMethod
  if (match?.groups?.method && !isPolarColorSpace(space as CssColorSpace)) {
    return null
  }
  return { hueMethod, space: space as CssColorSpace }
}

function parseMixItem(source: string, depth: number): MixItem | null {
  const suffix = source.match(MIX_PERCENTAGE_SUFFIX_REGEX)
  const prefix = source.match(MIX_PERCENTAGE_PREFIX_REGEX)
  const match = suffix ?? prefix
  const colorSource = match?.groups?.color?.trim() ?? source
  const percentageSource = match?.groups?.percentage
  const color = parseCssColorExpressionAtDepth(colorSource, depth)
  if (!color) {
    return null
  }

  if (!percentageSource) {
    return { color }
  }
  const percentage = parsePercentage(percentageSource, false)?.value
  if (percentage === undefined || percentage < 0 || percentage > 1) {
    return null
  }
  return { color, percentage: percentage * 100 }
}

function normalizeMixPercentages(items: readonly MixItem[]): {
  readonly alphaMultiplier: number
  readonly items: readonly WeightedColor[]
} | null {
  const specifiedTotal = items.reduce(
    (total, item) => total + (item.percentage ?? 0),
    0,
  )
  const omittedCount = items.filter(
    item => item.percentage === undefined,
  ).length
  const omittedPercentage =
    omittedCount > 0 ? (100 - specifiedTotal) / omittedCount : 0
  if (omittedPercentage < 0) {
    return null
  }

  const percentages = items.map(item => item.percentage ?? omittedPercentage)
  const total = percentages.reduce((sum, percentage) => sum + percentage, 0)
  if (total === 0) {
    return { alphaMultiplier: 0, items: [] }
  }
  const alphaMultiplier = Math.min(total / 100, 1)
  return {
    alphaMultiplier,
    items: items
      .map((item, index) => ({
        color: item.color,
        percentage: percentages[index] / total,
      }))
      .filter(item => item.percentage > 0),
  }
}

function interpolateColors(
  first: CssColorValue,
  second: CssColorValue,
  progress: number,
  hueMethod: HueInterpolationMethod,
): CssColorValue {
  const firstChannels = [...first.channels] as ColorChannels
  const secondChannels = [...second.channels] as ColorChannels
  const firstMissing = [...first.missing] as MissingColorComponents
  const secondMissing = [...second.missing] as MissingColorComponents
  let firstAlpha = first.alpha
  let secondAlpha = second.alpha

  for (let index = 0; index < 3; index++) {
    if (firstMissing[index] && !secondMissing[index]) {
      firstChannels[index] = secondChannels[index]
      firstMissing[index] = false
    } else if (secondMissing[index] && !firstMissing[index]) {
      secondChannels[index] = firstChannels[index]
      secondMissing[index] = false
    }
  }
  if (firstMissing[3] && !secondMissing[3]) {
    firstAlpha = secondAlpha
    firstMissing[3] = false
  } else if (secondMissing[3] && !firstMissing[3]) {
    secondAlpha = firstAlpha
    secondMissing[3] = false
  }

  const hueIndex = getHueChannelIndex(first.space)
  if (hueIndex !== null) {
    fixupHues(firstChannels, secondChannels, hueIndex, hueMethod)
  }
  const alpha = interpolate(firstAlpha, secondAlpha, progress)
  const channels = firstChannels.map((firstChannel, index) => {
    if (index === hueIndex) {
      return normalizeHue(
        interpolate(firstChannel, secondChannels[index], progress),
      )
    }
    const premultiplied = interpolate(
      firstChannel * firstAlpha,
      secondChannels[index] * secondAlpha,
      progress,
    )
    return alpha === 0 ? premultiplied : premultiplied / alpha
  }) as ColorChannels

  return createCssColor(first.space, channels, alpha, [
    firstMissing[0] && secondMissing[0],
    firstMissing[1] && secondMissing[1],
    firstMissing[2] && secondMissing[2],
    firstMissing[3] && secondMissing[3],
  ])
}

function fixupHues(
  first: ColorChannels,
  second: ColorChannels,
  hueIndex: number,
  method: HueInterpolationMethod,
): void {
  const difference = second[hueIndex] - first[hueIndex]
  switch (method) {
    case 'shorter': {
      if (difference > 180) {
        first[hueIndex] += 360
      } else if (difference < -180) {
        second[hueIndex] += 360
      }
      break
    }
    case 'longer': {
      if (difference > 0 && difference < 180) {
        first[hueIndex] += 360
      } else if (difference <= 0 && difference > -180) {
        second[hueIndex] += 360
      }
      break
    }
    case 'increasing': {
      if (second[hueIndex] < first[hueIndex]) {
        second[hueIndex] += 360
      }
      break
    }
    case 'decreasing': {
      if (first[hueIndex] < second[hueIndex]) {
        first[hueIndex] += 360
      }
      break
    }
  }
}

function splitTopLevel(source: string, separator: ',' | '/'): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false
  let partStart = 0

  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '(') {
      depth++
    } else if (character === ')') {
      depth--
    } else if (character === separator && depth === 0) {
      parts.push(source.slice(partStart, index))
      partStart = index + 1
    }
  }
  parts.push(source.slice(partStart))
  return parts
}

function interpolate(first: number, second: number, progress: number): number {
  return first + (second - first) * progress
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
