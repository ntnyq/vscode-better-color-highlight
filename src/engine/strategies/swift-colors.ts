import { rgbString } from '../../shared/color'
import type { RgbaColor } from '../../shared/color/presentation'
import type { ColorMatch, StrategyContext } from '../detection'
import { convertCssColor, createCssColor } from './css-color/space'
import {
  bindStaticArguments,
  formatNativeNumber,
  parseNativeNumber,
  parseStaticCall,
  rewriteStaticArguments,
  scanStaticCalls,
  type NativeColor,
  type StaticArgument,
} from './shared/static-call'

const SWIFT_CALL = /(?:(?:SwiftUI|UIKit)\.)?(?:Color|UIColor)\s*\(/gu

/**
 * Detect static SwiftUI and UIKit components, excluding assets/system colors.
 */
export function findSwiftColors(
  text: string,
  context?: StrategyContext,
): ColorMatch[] {
  if (context && context.languageId !== 'swift') {
    return []
  }
  return scanStaticCalls(text, SWIFT_CALL).flatMap(candidate => {
    const parsed = parseSwiftColor(candidate.source)
    if (!parsed) {
      return []
    }
    const { r, g, b, a } = parsed.color
    return [
      {
        start: candidate.start,
        end: candidate.end,
        color: rgbString(r, g, b, a),
        editMode: 'source',
        sourceKind: 'swift-color',
      },
    ]
  })
}

/**
 * Resolve explicit sRGB, linear sRGB, Display P3, HSB, and grayscale values.
 */
export function parseSwiftColor(source: string): NativeColor | null {
  const original = parseStaticCall(source)
  if (
    !original ||
    !/^(?:SwiftUI\.)?Color$|^(?:UIKit\.)?UIColor$/u.test(original.name) ||
    original.args.some(arg => arg.separator === '=')
  ) {
    return null
  }
  const isUIKit = original.name.endsWith('UIColor')
  const first = original.args[0]
  const spaceArg = first && !first.name ? first : undefined
  if (
    spaceArg &&
    (isUIKit ||
      !['.sRGB', '.sRGBLinear', '.displayP3'].includes(spaceArg.value))
  ) {
    return null
  }
  const call = {
    ...original,
    args: spaceArg ? original.args.slice(1) : original.args,
  }
  if (call.args.some(arg => !arg.name || /[fF]$/u.test(arg.value))) {
    return null
  }
  const isGray = call.args[0]?.name === 'white'
  const isHue = call.args[0]?.name === 'hue'
  const alphaName = isUIKit ? 'alpha' : 'opacity'
  let names = [
    isUIKit && call.args[0]?.name === 'displayP3Red' ? 'displayP3Red' : 'red',
    'green',
    'blue',
    alphaName,
  ]
  if (isGray) {
    names = ['white', alphaName]
  }
  if (isHue) {
    names = ['hue', 'saturation', 'brightness', alphaName]
  }
  if (spaceArg && isHue) {
    return null
  }
  // Swift argument labels have a fixed declaration order.
  if (call.args.some((arg, index) => arg.name !== names[index])) {
    return null
  }
  const args = bindStaticArguments(call, names)
  if (
    !args ||
    names.slice(0, -1).some(name => !args.has(name)) ||
    (isUIKit && !args.has(alphaName))
  ) {
    return null
  }
  const values = new Map<string, number>()
  for (const [name, arg] of args) {
    const value = parseNativeNumber(arg.value)
    if (value === null || value < 0 || value > 1) {
      return null
    }
    values.set(name, value)
  }
  const alpha = values.get(alphaName) ?? 1
  let space: 'srgb' | 'srgb-linear' | 'display-p3' = 'srgb'
  if (spaceArg?.value === '.sRGBLinear') {
    space = 'srgb-linear'
  }
  if (spaceArg?.value === '.displayP3' || names[0] === 'displayP3Red') {
    space = 'display-p3'
  }
  const get = (name: string) => values.get(name) ?? 0
  let rgb = createCssColor(
    space,
    isGray
      ? [get('white'), get('white'), get('white')]
      : [get(names[0]), get('green'), get('blue')],
    alpha,
  )
  if (isHue) {
    const lightness = get('brightness') * (1 - get('saturation') / 2)
    const saturation =
      lightness === 0 || lightness === 1
        ? 0
        : (get('brightness') - lightness) / Math.min(lightness, 1 - lightness)
    rgb = createCssColor(
      'hsl',
      [get('hue') * 360, saturation, lightness],
      alpha,
    )
  }
  const srgb = convertCssColor(rgb, 'srgb')
  const color: RgbaColor = {
    r: srgb.channels[0] * 255,
    g: srgb.channels[1] * 255,
    b: srgb.channels[2] * 255,
    a: alpha,
  }
  return {
    color,
    format: next => {
      const incoming = createCssColor(
        'srgb',
        [next.r / 255, next.g / 255, next.b / 255],
        next.a,
      )
      const converted = convertCssColor(incoming, space).channels
      const nextValues: Record<string, number> = {
        [names[0]]: converted[0],
        red: converted[0],
        green: converted[1],
        blue: converted[2],
        [alphaName]: next.a,
      }
      if (
        isGray &&
        (Math.abs(next.r - next.g) > 0.0001 ||
          Math.abs(next.g - next.b) > 0.0001)
      ) {
        const prefix = spaceArg ? `${spaceArg.value}, ` : ''
        return `${original.name}(${prefix}red: ${formatNativeNumber(converted[0])}, green: ${formatNativeNumber(converted[1])}, blue: ${formatNativeNumber(converted[2])}, ${alphaName}: ${formatNativeNumber(next.a)})`
      }
      if (isHue) {
        const hsl = convertCssColor(incoming, 'hsl').channels
        const value = Math.max(next.r, next.g, next.b) / 255
        nextValues.hue = hsl[0] / 360
        nextValues.saturation =
          value === 0 ? 0 : 1 - Math.min(next.r, next.g, next.b) / 255 / value
        nextValues.brightness = value
      }
      const replacements = new Map<StaticArgument, string>()
      for (const [name, arg] of args) {
        replacements.set(arg, formatNativeNumber(nextValues[name]))
      }
      return rewriteStaticArguments(
        original,
        replacements,
        !args.has(alphaName) && next.a < 1
          ? `${alphaName}: ${formatNativeNumber(next.a)}`
          : undefined,
      )
    },
  }
}
