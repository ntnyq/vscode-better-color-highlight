const COLOR_UTILITY_PREFIXES = [
  'inset-shadow',
  'drop-shadow',
  'text-shadow',
  'ring-offset',
  'inset-ring',
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

const HARD_TOKEN_BOUNDARY_REGEX = /[\s"'`{}]/u
const OUTER_TOKEN_BOUNDARY_REGEX = /[<>=;,]/u
const START_BOUNDARY_REGEX = /[\s"'`<>{}=;,.#]/u
const DIGIT_REGEX = /\d/u
const NAMED_VALUE_REGEX = /^[a-z][\w-]*$/iu
const CUSTOM_PROPERTY_REGEX = /^--[\w-]+$/u

export type TailwindColorUtilityKind = 'arbitrary' | 'named' | 'property'

/** One structurally valid Tailwind color utility and its complete token range. */
export interface TailwindColorUtility {
  readonly end: number
  readonly kind: TailwindColorUtilityKind
  readonly opacity?: string
  readonly prefix: (typeof COLOR_UTILITY_PREFIXES)[number]
  readonly start: number
  readonly value: string
  readonly variants: readonly string[]
}

/** Find complete Tailwind color utility tokens in one bounded forward scan. */
export function findTailwindColorUtilities(
  text: string,
): TailwindColorUtility[] {
  const utilities: TailwindColorUtility[] = []
  let start = 0

  while (start < text.length) {
    let isClassSelector = false
    while (start < text.length && START_BOUNDARY_REGEX.test(text[start])) {
      isClassSelector = text[start] === '.'
      start++
    }
    if (start >= text.length) {
      break
    }

    const end = findTokenEnd(text, start, isClassSelector)

    const utility = parseCandidate(
      text.slice(start, end),
      start,
      end,
      isClassSelector,
    )
    if (utility) {
      utilities.push(utility)
    }
    start = end
  }

  return utilities
}

function findTokenEnd(
  text: string,
  start: number,
  isClassSelector: boolean,
): number {
  let squareDepth = 0
  let escaped = false

  for (let index = start; index < text.length; index++) {
    const char = text[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
    } else if (char === '[') {
      squareDepth++
    } else if (char === ']') {
      squareDepth = Math.max(squareDepth - 1, 0)
    } else if (
      HARD_TOKEN_BOUNDARY_REGEX.test(char) ||
      (squareDepth === 0 &&
        ((isClassSelector && char === ':') ||
          OUTER_TOKEN_BOUNDARY_REGEX.test(char) ||
          isSelectorRestart(text, start, index)))
    ) {
      return index
    }
  }

  return text.length
}

function isSelectorRestart(
  text: string,
  start: number,
  index: number,
): boolean {
  const char = text[index]
  if (char === '#') {
    return true
  }
  if (char !== '.') {
    return false
  }

  const previous = index > start ? text[index - 1] : ''
  const next = text[index + 1] ?? ''
  return (
    !DIGIT_REGEX.test(next) || (previous !== '/' && !DIGIT_REGEX.test(previous))
  )
}

function parseCandidate(
  candidate: string,
  start: number,
  end: number,
  isClassSelector = false,
): TailwindColorUtility | null {
  if (
    candidate.startsWith('-') ||
    candidate.includes('${') ||
    candidate.includes('\\${')
  ) {
    return null
  }

  const value = isClassSelector
    ? candidate.replaceAll(String.raw`\:`, ':')
    : candidate
  const segments = splitTopLevel(value, ':')
  if (!segments || segments.some(segment => !segment)) {
    return null
  }
  const validSuffix = Array.from({ length: segments.length + 1 }, () => false)
  validSuffix[segments.length] = true
  for (let index = segments.length - 1; index >= 0; index--) {
    validSuffix[index] =
      validSuffix[index + 1] && isValidVariant(segments[index])
  }

  let offset = 0
  let validPrefix = true
  for (let index = 0; index < segments.length; index++) {
    const body = segments[index]
    const parsed = parseBody(body)
    if (parsed && validPrefix && validSuffix[index + 1]) {
      return {
        ...parsed,
        end: index === segments.length - 1 ? end : start + offset + body.length,
        start,
        variants: segments.slice(0, index),
      }
    }
    validPrefix &&= isValidVariant(body)
    offset += body.length + 1
  }

  return null
}

function parseBody(
  input: string,
): Omit<TailwindColorUtility, 'end' | 'start' | 'variants'> | null {
  let body = input
  const hasLeadingImportant = body.startsWith('!')
  const hasTrailingImportant = body.endsWith('!')
  if (hasLeadingImportant && hasTrailingImportant) {
    return null
  }
  if (hasLeadingImportant) {
    body = body.slice(1)
  }
  if (hasTrailingImportant) {
    body = body.slice(0, -1)
  }
  if (!body || body.startsWith('!') || body.endsWith('!')) {
    return null
  }

  for (const prefix of COLOR_UTILITY_PREFIXES) {
    const marker = `${prefix}-`
    if (!body.startsWith(marker)) {
      continue
    }
    const parsed = parseValueAndOpacity(body.slice(marker.length))
    return parsed ? { ...parsed, prefix } : null
  }

  return null
}

function parseValueAndOpacity(
  input: string,
): Pick<TailwindColorUtility, 'kind' | 'opacity' | 'value'> | null {
  const split = splitTopLevelOnce(input, '/')
  if (!split) {
    return null
  }
  const [rawValue, opacity] = split
  if (!rawValue || (opacity !== undefined && !isValidOpacity(opacity))) {
    return null
  }

  if (isWrapped(rawValue, '[', ']')) {
    const decoded = decodeArbitraryValue(rawValue.slice(1, -1))
    const value = decoded.startsWith('color:')
      ? decoded.slice('color:'.length)
      : decoded
    return value && !value.includes('theme(')
      ? { kind: 'arbitrary', ...(opacity ? { opacity } : {}), value }
      : null
  }
  if (isWrapped(rawValue, '(', ')')) {
    const value = rawValue.slice(1, -1)
    return CUSTOM_PROPERTY_REGEX.test(value)
      ? { kind: 'property', ...(opacity ? { opacity } : {}), value }
      : null
  }
  return NAMED_VALUE_REGEX.test(rawValue)
    ? { kind: 'named', ...(opacity ? { opacity } : {}), value: rawValue }
    : null
}

function splitTopLevel(value: string, separator: string): string[] | null {
  const segments: string[] = []
  let segmentStart = 0
  let squareDepth = 0
  let parenthesisDepth = 0
  let escaped = false

  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
    } else if (char === '[') {
      squareDepth++
    } else if (char === ']') {
      if (--squareDepth < 0) {
        return null
      }
    } else if (char === '(') {
      parenthesisDepth++
    } else if (char === ')') {
      if (--parenthesisDepth < 0) {
        return null
      }
    } else if (
      char === separator &&
      squareDepth === 0 &&
      parenthesisDepth === 0
    ) {
      segments.push(value.slice(segmentStart, index))
      segmentStart = index + 1
    }
  }

  if (escaped || squareDepth !== 0 || parenthesisDepth !== 0) {
    return null
  }
  segments.push(value.slice(segmentStart))
  return segments
}

function splitTopLevelOnce(
  value: string,
  separator: string,
): readonly [string, string?] | null {
  const segments = splitTopLevel(value, separator)
  return !segments || segments.length > 2 ? null : [segments[0], segments[1]]
}

function isValidVariant(variant: string): boolean {
  const split = splitTopLevelOnce(variant, '/')
  if (!split) {
    return false
  }
  const [base, modifier] = split
  if (modifier !== undefined && !isValidVariantPart(modifier, false)) {
    return false
  }
  return isValidVariantPart(base, true)
}

function isValidVariantPart(value: string, allowCompound: boolean): boolean {
  if (isWrapped(value, '[', ']')) {
    return value.length > 2
  }
  if (allowCompound) {
    const arbitraryStart = value.indexOf('-[')
    if (arbitraryStart > 0) {
      return (
        /^[a-z][\w-]*$/iu.test(value.slice(0, arbitraryStart)) &&
        isWrapped(value.slice(arbitraryStart + 1), '[', ']') &&
        value.length > arbitraryStart + 3
      )
    }
  }
  return /^[a-z][\w-]*$/iu.test(value)
}

function isValidOpacity(value: string): boolean {
  if (!value) {
    return false
  }
  if (isWrapped(value, '[', ']')) {
    return value.length > 2
  }
  if (isWrapped(value, '(', ')')) {
    return CUSTOM_PROPERTY_REGEX.test(value.slice(1, -1))
  }
  return /^(?:\d+(?:\.\d+)?|\.\d+)%?$/u.test(value)
}

function isWrapped(value: string, open: string, close: string): boolean {
  return value.startsWith(open) && value.endsWith(close)
}

function decodeArbitraryValue(value: string): string {
  let decoded = ''
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === '\\' && value[index + 1] === '_') {
      decoded += '_'
      index++
    } else {
      decoded += char === '_' ? ' ' : char
    }
  }
  return decoded
}
