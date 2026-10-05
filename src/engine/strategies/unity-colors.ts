import { rgbString } from '../../shared/color'
import type { RgbaColor } from '../../shared/color/presentation'
import type { ColorMatch, StrategyContext } from '../detection'
import {
  formatNativeNumber,
  parseStaticCall,
  rewriteStaticArguments,
  scanStaticCalls,
  type NativeColor,
  type StaticArgument,
  type StaticCall,
} from './shared/static-call'

const UNITY_CALL = /new\s+(?:global::)?UnityEngine\.Color(?:32)?\s*\(/gu
const MAX_UNITY_CALL_LENGTH = 4096
const UNITY_CHANNELS = ['r', 'g', 'b', 'a'] as const
const UNITY_INTEGER = /^[+-]?\d(?:_*\d)*$/u
const UNITY_FLOAT =
  /^[+-]?(?:\d(?:_*\d)*(?:\.\d(?:_*\d)*)?|\.\d(?:_*\d)*)(?:[eE][+-]?\d(?:_*\d)*)?[fF]$/u

/**
 * Detect explicit Unity constructors without inferring C# imports or aliases.
 */
export function findUnityColors(
  text: string,
  context?: StrategyContext,
): ColorMatch[] {
  if (context && context.languageId !== 'csharp') {
    return []
  }
  return scanStaticCalls(text, UNITY_CALL, { allowNesting: false }).flatMap(
    candidate => {
      // C# identifiers include Unicode characters and the @ escape prefix.
      if (
        /[\p{L}\p{N}\p{Pc}\p{M}\p{Cf}@]$/u.test(
          text.slice(Math.max(0, candidate.start - 2), candidate.start),
        )
      ) {
        return []
      }
      const parsed = parseUnityColor(candidate.source)
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
          sourceKind: 'unity-color',
        },
      ]
    },
  )
}

/**
 * Parse static normalized Color or byte Color32 components, preserving syntax.
 */
export function parseUnityColor(source: string): NativeColor | null {
  const prefix = source.match(/^new\s+(?:global::)?/u)?.[0]
  if (!prefix || source.length > MAX_UNITY_CALL_LENGTH) {
    return null
  }
  const call = parseStaticCall(source.slice(prefix.length))
  const masked = source.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '')
  if (
    !call ||
    !/^UnityEngine\.Color(?:32)?$/u.test(call.name) ||
    call.args.some(arg => arg.separator === '=') ||
    /,\s*\)$/u.test(masked) ||
    !masked.endsWith(')')
  ) {
    return null
  }
  const isByte = call.name === 'UnityEngine.Color32'
  const args = bindUnityArguments(call)
  const required = isByte ? UNITY_CHANNELS : UNITY_CHANNELS.slice(0, 3)
  if (!args || required.some(name => !args.has(name))) {
    return null
  }
  const values = new Map<keyof RgbaColor, number>()
  for (const [name, arg] of args) {
    if (
      !UNITY_INTEGER.test(arg.value) &&
      (isByte || !UNITY_FLOAT.test(arg.value))
    ) {
      return null
    }
    const value = Number(arg.value.replaceAll('_', '').replace(/[fF]$/u, ''))
    if (!Number.isFinite(value) || value < 0 || value > (isByte ? 255 : 1)) {
      return null
    }
    values.set(name, value)
  }
  const scale = isByte ? 255 : 1
  const color: RgbaColor = {
    r: ((values.get('r') ?? 0) / scale) * 255,
    g: ((values.get('g') ?? 0) / scale) * 255,
    b: ((values.get('b') ?? 0) / scale) * 255,
    a: (values.get('a') ?? scale) / scale,
  }
  return {
    color,
    format: next => {
      const replacements = new Map<StaticArgument, string>()
      for (const [name, arg] of args) {
        // Alpha-only edits must retain every original RGB digit and suffix.
        if (next[name] === color[name]) {
          continue
        }
        const value = Math.min(
          1,
          Math.max(0, next[name] / (name === 'a' ? 1 : 255)),
        )
        replacements.set(
          arg,
          isByte
            ? String(Math.round(value * 255))
            : formatUnityFloat(value, arg.value),
        )
      }
      const append =
        !args.has('a') && next.a < 1
          ? `${call.args.some(arg => arg.name) ? 'a: ' : ''}${formatUnityFloat(Math.max(0, next.a), call.args.find(arg => /[fF]$/u.test(arg.value))?.value ?? 'f')}`
          : undefined
      return prefix + rewriteStaticArguments(call, replacements, append)
    },
  }
}

/**
 * C# permits positional arguments after names only when those names are in order.
 */
function bindUnityArguments(
  call: StaticCall,
): Map<keyof RgbaColor, StaticArgument> | null {
  const args = new Map<keyof RgbaColor, StaticArgument>()
  let hasReorderedName = false
  for (const [index, arg] of call.args.entries()) {
    if (!arg.name && hasReorderedName) {
      return null
    }
    const name = arg.name
      ? UNITY_CHANNELS.find(channel => channel === arg.name)
      : UNITY_CHANNELS[index]
    if (!name || args.has(name)) {
      return null
    }
    hasReorderedName ||= name !== UNITY_CHANNELS[index]
    args.set(name, arg)
  }
  return args
}

/**
 * A changed integer channel needs a float suffix when it becomes fractional.
 */
function formatUnityFloat(value: number, original: string): string {
  const formatted = formatNativeNumber(value, original)
  return /[fF]$/u.test(formatted) || UNITY_INTEGER.test(formatted)
    ? formatted
    : `${formatted}f`
}
