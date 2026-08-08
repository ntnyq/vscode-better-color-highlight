import { rgbString } from '../../../shared/color'
import type { ColorMatch } from '../../detection'
import { isDartMaterialColorNameAt, parseDartColorSource } from './parser'

export * from './presentation'

const DART_COLOR_CONSTRUCTOR_HEAD_REGEX =
  /(?<prefix>^|[^\w.])(?<head>Color(?:\.fromARGB|\.fromRGBO|\.from)?\s*\()/gu
const DART_MATERIAL_COLOR_REFERENCE_REGEX =
  /(?<prefix>^|[^\w.])(?<source>Colors\.(?<name>[_a-zA-Z][_a-zA-Z0-9]*))/gu
const DART_COLOR_FROM_COMPONENT_NAMES = new Set(['blue', 'green', 'red'])

/** Detect supported Flutter and Dart color expressions. */
export function findDartColors(text: string): ColorMatch[] {
  const matches = [
    ...findDartColorConstructors(text),
    ...findFlutterMaterialColors(text),
  ]
  return matches.sort((left, right) => left.start - right.start)
}

/** Whether a CSS named-color range is Dart color syntax, not a color value. */
export function isDartColorSyntaxNameAt(
  text: string,
  start: number,
  end: number,
): boolean {
  if (isDartMaterialColorNameAt(text, start, end)) {
    return true
  }

  const name = text.slice(start, end)
  if (!DART_COLOR_FROM_COMPONENT_NAMES.has(name)) {
    return false
  }

  for (const match of text.matchAll(DART_COLOR_CONSTRUCTOR_HEAD_REGEX)) {
    const prefix = match.groups?.prefix ?? ''
    const head = match.groups?.head
    if (!head || !/^Color\.from\s*\(/u.test(head)) {
      continue
    }

    const constructorStart = (match.index ?? 0) + prefix.length
    if (constructorStart > start) {
      return false
    }

    const openParenthesis = constructorStart + head.lastIndexOf('(')
    const constructorEnd = findClosingParenthesis(text, openParenthesis)
    if (
      constructorEnd !== null &&
      start > openParenthesis &&
      end < constructorEnd &&
      /^(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n\r]*(?:\r?\n|$))*:/u.test(
        text.slice(end, constructorEnd),
      )
    ) {
      return true
    }
  }

  return false
}

function findDartColorConstructors(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const match of text.matchAll(DART_COLOR_CONSTRUCTOR_HEAD_REGEX)) {
    const prefix = match.groups?.prefix ?? ''
    const head = match.groups?.head
    if (!head) {
      continue
    }

    const start = (match.index ?? 0) + prefix.length
    const openParenthesis = start + head.lastIndexOf('(')
    const end = findClosingParenthesis(text, openParenthesis)
    if (end === null) {
      continue
    }

    const source = text.slice(start, end)
    const parsed = parseDartColorSource(source)
    if (!parsed || parsed.kind === 'material') {
      continue
    }

    matches.push({
      start,
      end,
      color: rgbString(
        parsed.color.r,
        parsed.color.g,
        parsed.color.b,
        parsed.color.a,
      ),
    })
  }

  return matches
}

function findFlutterMaterialColors(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const match of text.matchAll(DART_MATERIAL_COLOR_REFERENCE_REGEX)) {
    const prefix = match.groups?.prefix ?? ''
    const source = match.groups?.source
    if (!source) {
      continue
    }

    const start = (match.index ?? 0) + prefix.length
    const end = start + source.length
    if (/^\s*(?:\.|\[)/u.test(text.slice(end))) {
      continue
    }

    const parsed = parseDartColorSource(source)
    if (!parsed || parsed.kind !== 'material') {
      continue
    }

    matches.push({
      start,
      end,
      color: rgbString(
        parsed.color.r,
        parsed.color.g,
        parsed.color.b,
        parsed.color.a,
      ),
      editMode: 'read-only',
    })
  }

  return matches
}

function findClosingParenthesis(
  text: string,
  openIndex: number,
): number | null {
  let depth = 0
  let quote: "'" | '"' | null = null
  let blockCommentDepth = 0
  let isLineComment = false

  for (let index = openIndex; index < text.length; index++) {
    const character = text[index]
    const nextCharacter = text[index + 1]

    if (isLineComment) {
      if (character === '\n' || character === '\r') {
        isLineComment = false
      }
      continue
    }

    if (blockCommentDepth > 0) {
      if (character === '/' && nextCharacter === '*') {
        blockCommentDepth++
        index++
      } else if (character === '*' && nextCharacter === '/') {
        blockCommentDepth--
        index++
      }
      continue
    }

    if (quote) {
      if (character === '\\') {
        index++
      } else if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '/' && nextCharacter === '/') {
      isLineComment = true
      index++
      continue
    }
    if (character === '/' && nextCharacter === '*') {
      blockCommentDepth = 1
      index++
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if (character === '(') {
      depth++
      continue
    }
    if (character !== ')') {
      continue
    }

    depth--
    if (depth === 0) {
      return index + 1
    }
  }

  return null
}
