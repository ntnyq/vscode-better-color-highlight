import { hexARGBToRgb, rgbString } from '../../shared/color'
import {
  parseResolvedColor,
  type RgbaColor,
} from '../../shared/color/presentation'
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
const PICKER_CHANNEL_EPSILON = Number.EPSILON * 255

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
  return scanStaticCalls(text, ANDROID_CALL, {
    nestedBlockComments: context?.languageId !== 'java',
  }).flatMap(candidate => {
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
  const call = parseStaticCall(source, {
    nestedBlockComments: languageId === 'kotlin',
  })
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
    return parseAndroidHexCall(call, languageId)
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
  if (isCompose) {
    names.push('colorSpace')
  }
  const args = bindStaticArguments(call, names)
  if (!args || (method === 'rgb' && args.has('alpha'))) {
    return null
  }
  const required = method === 'argb' ? names : names.slice(0, 3)
  if (required.some(name => !args.has(name))) {
    return null
  }
  const spaceArg = args.get('colorSpace')
  const space = spaceArg ? resolveComposeColorSpace(spaceArg.value) : 'srgb'
  if (!space) {
    return null
  }
  const numericArgs = new Map(
    [...args].filter(([name]) => name !== 'colorSpace'),
  )
  const numbers = parseAndroidNumbers(numericArgs, isHue, Boolean(spaceArg))
  if (!numbers) {
    return null
  }
  const { isFloat, values } = numbers
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
    const nativeRgb = convertCssColor(
      createCssColor('hsl', [hue, hslSaturation, lightness], alpha),
      'srgb',
    )
    const rgb = convertCssColor(
      createCssColor(space, nativeRgb.channels, alpha),
      'srgb',
    )
    color = {
      r: rgb.channels[0] * 255,
      g: rgb.channels[1] * 255,
      b: rgb.channels[2] * 255,
      a: alpha,
    }
  } else {
    const rgb = convertCssColor(
      createCssColor(space, [
        (values.get('red') ?? 0) / scale,
        (values.get('green') ?? 0) / scale,
        (values.get('blue') ?? 0) / scale,
      ]),
      'srgb',
    ).channels
    color = {
      r: rgb[0] * 255,
      g: rgb[1] * 255,
      b: rgb[2] * 255,
      a: alpha,
    }
  }
  const appendAlpha = (nextAlpha: number) =>
    !args.has('alpha') && nextAlpha < 1
      ? `${call.args.some(arg => arg.name) ? 'alpha = ' : ''}${formatNativeNumber(isFloat ? nextAlpha : Math.round(nextAlpha * 255), isFloat ? 'f' : '')}`
      : undefined
  const alphaArg = args.get('alpha')
  const formatAlpha = (nextAlpha: number) =>
    nextAlpha === alpha
      ? call.source
      : rewriteAndroidArguments(
          call,
          alphaArg
            ? new Map([
                [alphaArg, formatNativeNumber(nextAlpha, alphaArg.value)],
              ])
            : new Map(),
          languageId,
          appendAlpha(nextAlpha),
        )
  const preview = spaceArg
    ? parseResolvedColor(rgbString(color.r, color.g, color.b, color.a))
    : null
  return {
    color,
    formatAlpha: spaceArg ? formatAlpha : undefined,
    format: next => {
      // Compare the actual picker preview, including clipping/rounding. Only
      // tolerate normalization round-trip noise, not a visible color change.
      if (
        preview &&
        (['r', 'g', 'b'] as const).every(
          channel =>
            Math.abs(next[channel] - preview[channel]) <=
            PICKER_CHANNEL_EPSILON,
        )
      ) {
        return next.a === preview.a ? call.source : formatAlpha(next.a)
      }
      // Picker channels are sRGB; HSL/HSV must describe the original RGB space.
      const nativeRgb = convertCssColor(
        createCssColor('srgb', [next.r / 255, next.g / 255, next.b / 255]),
        space,
      ).channels.map(channel => Math.min(1, Math.max(0, channel)))
      const nextValues: Record<string, number> = {
        red: nativeRgb[0] * scale,
        green: nativeRgb[1] * scale,
        blue: nativeRgb[2] * scale,
        alpha: next.a * scale,
      }
      if (isHue) {
        const hsl = convertCssColor(
          createCssColor('srgb', [nativeRgb[0], nativeRgb[1], nativeRgb[2]]),
          'hsl',
        ).channels
        const value = Math.max(...nativeRgb)
        nextValues.hue = hsl[0]
        nextValues.saturation = hsl[1]
        if (method === 'hsv') {
          nextValues.saturation =
            value === 0 ? 0 : 1 - Math.min(...nativeRgb) / value
        }
        nextValues.lightness = hsl[2]
        nextValues.value = value
      }
      const replacements = new Map<StaticArgument, string>()
      for (const [name, arg] of numericArgs) {
        replacements.set(
          arg,
          formatNativeNumber(
            isFloat ? nextValues[name] : Math.round(nextValues[name]),
            arg.value,
          ),
        )
      }
      if (method === 'rgb' && next.a < 1) {
        const alphaArgument = formatNativeNumber(
          isFloat ? next.a : Math.round(next.a * scale),
          call.args[0].value,
        )
        // Insert alpha before the original argument text so comments stay
        // attached to their channels and existing numeric suffixes survive.
        const replacement = rewriteStaticArguments(call, replacements).replace(
          /\.rgb(?<opening>\s*\()/u,
          `.argb$<opening>${alphaArgument}, `,
        )
        return parseStaticCall(replacement, {
          nestedBlockComments: languageId === 'kotlin',
        })
          ? replacement
          : null
      }
      return rewriteAndroidArguments(
        call,
        replacements,
        languageId,
        appendAlpha(next.a),
      )
    },
  }
}

/**
 * Keep generated edits within the same literal-call bounds as detected input.
 */
function rewriteAndroidArguments(
  call: StaticCall,
  values: ReadonlyMap<StaticArgument, string>,
  languageId: string,
  append?: string,
): string | null {
  const result = rewriteStaticArguments(call, values, append)
  return parseStaticCall(result, {
    nestedBlockComments: languageId === 'kotlin',
  })
    ? result
    : null
}

/**
 * Validate numeric overloads independently of optional color-space arguments.
 */
function parseAndroidNumbers(
  args: ReadonlyMap<string, StaticArgument>,
  isHue: boolean,
  hasExplicitSpace: boolean,
) {
  const values = new Map<string, number>()
  const floatArguments = [...args.values()].map(arg => /[fF]$/u.test(arg.value))
  const isFloat = isHue || floatArguments.some(Boolean)
  if (
    (isFloat && !floatArguments.every(Boolean)) ||
    (hasExplicitSpace && !isFloat)
  ) {
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
  return { isFloat, values }
}

/**
 * Resolve a deliberately small, literal-only subset of Compose RGB spaces.
 */
function resolveComposeColorSpace(
  source: string,
): 'srgb' | 'srgb-linear' | 'display-p3' | null {
  const name = source.match(
    /^(?:androidx\.compose\.ui\.graphics\.colorspace\.)?ColorSpaces\.(?<name>Srgb|LinearSrgb|DisplayP3)$/u,
  )?.groups?.name
  switch (name) {
    case 'Srgb': {
      return 'srgb'
    }
    case 'LinearSrgb': {
      return 'srgb-linear'
    }
    case 'DisplayP3': {
      return 'display-p3'
    }
    default: {
      return null
    }
  }
}

/**
 * Keep Android parseColor strings in their documented alpha-first byte order.
 */
function parseAndroidHexCall(
  call: StaticCall,
  languageId: string,
): NativeColor | null {
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
      return rewriteAndroidArguments(
        call,
        new Map([[arg, `"#${hex}"`]]),
        languageId,
      )
    },
  }
}
