import type { RgbaColor } from '../../../shared/color/presentation'

export interface StaticArgument {
  readonly name?: string
  readonly separator?: string
  readonly value: string
  readonly start: number
  readonly end: number
}

export interface StaticCall {
  readonly name: string
  readonly args: readonly StaticArgument[]
  readonly source: string
}

export interface NativeColor {
  readonly color: RgbaColor
  readonly format: (color: RgbaColor) => string | null
  /**
   * Edit alpha without converting or rounding the original color components.
   */
  readonly formatAlpha?: (alpha: number) => string | null
}

interface StaticCallCommentOptions {
  /**
   * Kotlin block comments may contain further block comments.
   */
  readonly nestedBlockComments?: boolean
}

interface StaticCallScanOptions extends StaticCallCommentOptions {
  /**
   * Disable for literal-only calls to stop invalid nested candidates early.
   */
  readonly allowNesting?: boolean
}

const MAX_CALL_LENGTH = 4096

/**
 * Scan bounded calls; quotes and comments cannot prematurely close a call.
 */
export function scanStaticCalls(
  text: string,
  head: RegExp,
  options: StaticCallScanOptions = {},
) {
  const calls: { source: string; start: number; end: number }[] = []
  for (const match of text.matchAll(head)) {
    const start = match.index
    if (/[\w.$]/u.test(text[start - 1] ?? '')) {
      continue
    }
    let depth = 1
    let quote = ''
    const limit = Math.min(text.length, start + MAX_CALL_LENGTH)
    for (let index = start + match[0].length; index < limit; index++) {
      const char = text[index]
      if (quote) {
        if (char === '\\') {
          index++
        } else if (char === quote) {
          quote = ''
        }
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (text.startsWith('/*', index)) {
        const end = getBlockCommentEnd(
          text,
          index,
          limit,
          options.nestedBlockComments,
        )
        if (end === null) {
          break
        }
        index = end - 1
      } else if (text.startsWith('//', index)) {
        const close = text.slice(index + 2, limit).indexOf('\n')
        if (close === -1) {
          break
        }
        index += close + 2
      } else if (char === '(') {
        if (options.allowNesting === false) {
          break
        }
        depth++
      } else if (char === ')' && --depth === 0) {
        calls.push({
          source: text.slice(start, index + 1),
          start,
          end: index + 1,
        })
        break
      }
    }
  }
  return calls
}

/**
 * Parse flat, literal native arguments and retain spans for source edits.
 */
export function parseStaticCall(
  source: string,
  options: StaticCallCommentOptions = {},
): StaticCall | null {
  const head = source.match(/^(?<name>[\w.]+)\s*\(/u)
  if (
    !head?.groups?.name ||
    !source.endsWith(')') ||
    source.length > MAX_CALL_LENGTH
  ) {
    return null
  }
  const masked = maskStaticCallComments(source, options)
  if (!masked?.endsWith(')')) {
    return null
  }
  const body = masked.slice(head[0].length, -1)
  const args: StaticArgument[] = []
  const parts = body.split(',')
  if (!parts.at(-1)?.trim()) {
    parts.pop()
  }
  let offset = head[0].length
  for (const part of parts) {
    const match = part.match(
      /^\s*(?:(?<name>\w+)\s*(?<separator>[:=])\s*)?(?<value>"[^"\\]*"|[^\s()]+)\s*$/u,
    )
    const value = match?.groups?.value
    if (!value) {
      return null
    }
    const start = offset + part.lastIndexOf(value)
    args.push({
      name: match?.groups?.name,
      separator: match?.groups?.separator,
      value,
      start,
      end: start + value.length,
    })
    offset += part.length + 1
  }
  return { name: head.groups.name, args, source }
}

/**
 * Find a complete block comment without reading beyond the call's limit.
 */
function getBlockCommentEnd(
  text: string,
  start: number,
  limit: number,
  nested = false,
): number | null {
  let depth = 1
  for (let index = start + 2; index + 1 < limit; index++) {
    if (text.startsWith('*/', index)) {
      if (--depth === 0) {
        return index + 2
      }
      index++
    } else if (nested && text.startsWith('/*', index)) {
      depth++
      index++
    }
  }
  return null
}

/**
 * Mask complete comments while retaining UTF-16 spans and quoted literals.
 */
function maskStaticCallComments(
  source: string,
  options: StaticCallCommentOptions,
): string | null {
  let masked = ''
  let cursor = 0
  let quote = ''
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (char === '\\') {
        index++
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    let end: number
    if (source.startsWith('/*', index)) {
      const commentEnd = getBlockCommentEnd(
        source,
        index,
        source.length,
        options.nestedBlockComments,
      )
      if (commentEnd === null) {
        return null
      }
      end = commentEnd
    } else if (source.startsWith('//', index)) {
      const lineEnd = source.indexOf('\n', index + 2)
      end = lineEnd === -1 ? source.length : lineEnd
    } else {
      continue
    }
    masked += source.slice(cursor, index) + ' '.repeat(end - index)
    cursor = end
    index = end - 1
  }
  return quote ? null : masked + source.slice(cursor)
}

/**
 * Bind positional or named arguments, rejecting duplicate and unknown names.
 */
export function bindStaticArguments(
  call: StaticCall,
  names: readonly string[],
): Map<string, StaticArgument> | null {
  const result = new Map<string, StaticArgument>()
  let named = false
  for (const [index, arg] of call.args.entries()) {
    if (!arg.name && named) {
      return null
    }
    named ||= Boolean(arg.name)
    const name = arg.name ?? names[index]
    if (!name || !names.includes(name) || result.has(name)) {
      return null
    }
    result.set(name, arg)
  }
  return result
}

export function parseNativeNumber(source: string): number | null {
  if (!/^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?[fF]?$/u.test(source)) {
    return null
  }
  const value = Number(source.replace(/[fF]$/u, ''))
  return Number.isFinite(value) ? value : null
}

export function formatNativeNumber(value: number, original = ''): string {
  const suffix = original.match(/[fF]$/u)?.[0] ?? ''
  return `${Number(value.toFixed(6))}${suffix}`
}

/**
 * Replace argument values without changing names, comments, or whitespace.
 */
export function rewriteStaticArguments(
  call: StaticCall,
  values: ReadonlyMap<StaticArgument, string>,
  append?: string,
): string {
  let result = call.source
  const lastArgument = call.args.at(-1)
  for (const arg of call.args.toReversed()) {
    let value = values.get(arg)
    if (append && arg === lastArgument) {
      value = `${value ?? arg.value}, ${append}`
    }
    if (value !== undefined) {
      result = result.slice(0, arg.start) + value + result.slice(arg.end)
    }
  }
  return result
}
