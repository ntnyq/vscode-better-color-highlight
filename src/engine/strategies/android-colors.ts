import { hexARGBToRgb, rgbString } from '../../shared/color'
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
  type StaticCall,
} from './shared/static-call'

const ANDROID_CALL =
  /(?:androidx\.compose\.ui\.graphics\.|android\.graphics\.)?Color(?:\.(?:hsl|hsv|rgb|argb|parseColor))?\s*\(/gu

/**
 * Detect literal Compose constructors and Android framework color factories.
 */
export function findAndroidColors(
  text: string,
  context?: StrategyContext,
): ColorMatch[] {
  if (
    context &&
    context.languageId !== 'kotlin' &&
    context.languageId !== 'java'
  ) {
    return []
  }
  return scanStaticCalls(text, ANDROID_CALL).flatMap(candidate => {
    const parsed = parseAndroidColor(
      candidate.source,
      context?.languageId ?? 'kotlin',
    )
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
        sourceKind: 'android-color',
      },
    ]
  })
}

/**
 * Parse only explicit numeric overloads; never execute project expressions.
 */
export function parseAndroidColor(
  source: string,
  languageId = 'kotlin',
): NativeColor | null {
  const call = parseStaticCall(source)
  if (
    !call ||
    !/^(?:(?:androidx\.compose\.ui\.graphics|android\.graphics)\.)?Color(?:\.(?:hsl|hsv|rgb|argb|parseColor))?$/u.test(
      call.name,
    ) ||
    call.args.some(arg => arg.separator === ':')
  ) {
    return null
  }
  const method = call.name.split('.').at(-1)
  const isCompose = method === 'Color' || method === 'hsl' || method === 'hsv'
  if (
    (isCompose &&
      (languageId !== 'kotlin' || call.name.startsWith('android.graphics.'))) ||
    (!isCompose && call.name.startsWith('androidx.'))
  ) {
    return null
  }
  if (!isCompose && call.args.some(arg => arg.name)) {
    return null
  }

  if (method === 'parseColor') {
    return parseAndroidHexCall(call)
  }

  const isHue = method === 'hsl' || method === 'hsv'
  let names = ['red', 'green', 'blue', 'alpha']
  if (method === 'argb') {
    names = ['alpha', 'red', 'green', 'blue']
  }
  if (isHue) {
    names = [
      'hue',
      'saturation',
      method === 'hsl' ? 'lightness' : 'value',
      'alpha',
    ]
  }
  const args = bindStaticArguments(call, names)
  if (!args || (method === 'rgb' && args.has('alpha'))) {
    return null
  }
  const required = method === 'argb' ? names : names.slice(0, 3)
  if (required.some(name => !args.has(name))) {
    return null
  }
  const values = new Map<string, number>()
  const floatArguments = [...args.values()].map(arg => /[fF]$/u.test(arg.value))
  const isFloat = isHue || floatArguments.some(Boolean)
  if (isFloat && !floatArguments.every(Boolean)) {
    return null
  }
  if (!isFloat && [...args.values()].some(arg => !/^\d+$/u.test(arg.value))) {
    return null
  }
  for (const [name, arg] of args) {
    const value = parseNativeNumber(arg.value)
    let max = isFloat ? 1 : 255
    if (isHue && name === 'hue') {
      max = 360
    }
    if (value === null || value < 0 || value > max) {
      return null
    }
    values.set(name, value)
  }
  const scale = isFloat ? 1 : 255
  const alpha = (values.get('alpha') ?? scale) / scale
  let color: RgbaColor
  if (isHue) {
    const hue = values.get('hue') ?? 0
    const saturation = values.get('saturation') ?? 0
    const third = values.get(names[2]) ?? 0
    // HSV and HSL share hue but differ in the meaning of the third channel.
    const lightness = method === 'hsv' ? third * (1 - saturation / 2) : third
    let hslSaturation = saturation
    if (method === 'hsv') {
      hslSaturation =
        lightness === 0 || lightness === 1
          ? 0
          : (third - lightness) / Math.min(lightness, 1 - lightness)
    }
    const rgb = convertCssColor(
      createCssColor('hsl', [hue, hslSaturation, lightness], alpha),
      'srgb',
    )
    color = {
      r: rgb.channels[0] * 255,
      g: rgb.channels[1] * 255,
      b: rgb.channels[2] * 255,
      a: alpha,
    }
  } else {
    color = {
      r: ((values.get('red') ?? 0) / scale) * 255,
      g: ((values.get('green') ?? 0) / scale) * 255,
      b: ((values.get('blue') ?? 0) / scale) * 255,
      a: alpha,
    }
  }
  return {
    color,
    format: next => {
      const nextValues: Record<string, number> = {
        red: (next.r / 255) * scale,
        green: (next.g / 255) * scale,
        blue: (next.b / 255) * scale,
        alpha: next.a * scale,
      }
      if (isHue) {
        const hsl = convertCssColor(
          createCssColor('srgb', [next.r / 255, next.g / 255, next.b / 255]),
          'hsl',
        ).channels
        const value = Math.max(next.r, next.g, next.b) / 255
        nextValues.hue = hsl[0]
        nextValues.saturation = hsl[1]
        if (method === 'hsv') {
          nextValues.saturation =
            value === 0 ? 0 : 1 - Math.min(next.r, next.g, next.b) / 255 / value
        }
        nextValues.lightness = hsl[2]
        nextValues.value = value
      }
      const replacements = new Map<StaticArgument, string>()
      for (const [name, arg] of args) {
        replacements.set(
          arg,
          formatNativeNumber(
            isFloat ? nextValues[name] : Math.round(nextValues[name]),
            arg.value,
          ),
        )
      }
      if (method === 'rgb' && next.a < 1) {
        const suffix = isFloat ? 'f' : ''
        const channel = (value: number) =>
          formatNativeNumber(isFloat ? value : Math.round(value), suffix)
        return `${call.name.replace(/rgb$/u, 'argb')}(${channel(next.a * scale)}, ${channel(nextValues.red)}, ${channel(nextValues.green)}, ${channel(nextValues.blue)})`
      }
      const append =
        !args.has('alpha') && next.a < 1
          ? `${call.args.some(arg => arg.name) ? 'alpha = ' : ''}${formatNativeNumber(isFloat ? next.a : Math.round(next.a * 255), isFloat ? 'f' : '')}`
          : undefined
      return rewriteStaticArguments(call, replacements, append)
    },
  }
}

/**
 * Keep Android parseColor strings in their documented alpha-first byte order.
 */
function parseAndroidHexCall(call: StaticCall): NativeColor | null {
  const arg = call.args[0]
  if (
    call.args.length !== 1 ||
    !/^"#[\da-f]{6}(?:[\da-f]{2})?"$/iu.test(arg.value)
  ) {
    return null
  }
  const value = hexARGBToRgb(arg.value.slice(1, -1))
  if (!value) {
    return null
  }
  return {
    color: { ...value, a: value.a ?? 1 },
    format: color => {
      const channels = [color.r, color.g, color.b]
      if (color.a < 1 || arg.value.length === 11) {
        channels.unshift(color.a * 255)
      }
      let hex = channels
        .map(channel => Math.round(channel).toString(16).padStart(2, '0'))
        .join('')
      if (/[A-F]/u.test(arg.value) && !/[a-f]/u.test(arg.value)) {
        hex = hex.toUpperCase()
      }
      return rewriteStaticArguments(call, new Map([[arg, `"#${hex}"`]]))
    },
  }
}
