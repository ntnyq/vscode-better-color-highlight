import { rgbString } from '../../../shared/color'
import type { ColorMatch } from '../../detection'
import { isDartMaterialColorNameAt, parseDartColorSource } from './parser'
import { findDartColorConstructorRanges, skipDartTrivia } from './scanner'

export * from './presentation'

const DART_MATERIAL_COLOR_REFERENCE_REGEX =
  /(?<prefix>^|[^\w.])(?<source>Colors\.(?<name>[_a-zA-Z][_a-zA-Z0-9]*))/gu
const DART_COLOR_FROM_COMPONENT_NAMES = new Set(['blue', 'green', 'red'])
const DART_COLOR_FROM_COMPONENT_REGEX = /\b(?:blue|green|red)\b/gu

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
  componentNameStarts: ReadonlySet<number>,
): boolean {
  return (
    isDartMaterialColorNameAt(text, start, end) ||
    (DART_COLOR_FROM_COMPONENT_NAMES.has(text.slice(start, end)) &&
      componentNameStarts.has(start))
  )
}

/** Find CSS named-color words used as `Color.from` component labels. */
export function findDartColorComponentNameStarts(
  text: string,
): ReadonlySet<number> {
  const constructorRanges = findDartColorConstructorRanges(text).filter(range =>
    /^Color\.from\s*\(/u.test(range.head),
  )
  const componentNameStarts = new Set<number>()
  let constructorIndex = 0
  let activeConstructorEnd = -1

  for (const match of text.matchAll(DART_COLOR_FROM_COMPONENT_REGEX)) {
    const start = match.index ?? 0
    const end = start + match[0].length

    while (
      constructorRanges[constructorIndex] &&
      constructorRanges[constructorIndex].start < start
    ) {
      activeConstructorEnd = Math.max(
        activeConstructorEnd,
        constructorRanges[constructorIndex].end,
      )
      constructorIndex++
    }

    if (end < activeConstructorEnd && text[skipDartTrivia(text, end)] === ':') {
      componentNameStarts.add(start)
    }
  }

  return componentNameStarts
}

function findDartColorConstructors(text: string): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const { end, start } of findDartColorConstructorRanges(text)) {
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
      editMode: 'source',
      sourceKind: 'dart',
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
    const nextSourceCharacter = text[skipDartTrivia(text, end)]
    if (nextSourceCharacter === '.' || nextSourceCharacter === '[') {
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
