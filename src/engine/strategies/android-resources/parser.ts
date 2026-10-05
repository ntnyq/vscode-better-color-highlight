import type { ColorSourceRange } from '../../definition/types'

interface XmlAttribute extends ColorSourceRange {
  readonly value: string
}

interface XmlElement extends ColorSourceRange {
  readonly name: string
  readonly attributes: ReadonlyMap<string, XmlAttribute>
  readonly parent?: XmlElement
  readonly contentStart: number
  contentEnd: number
  end: number
  hasChildren: boolean
}

export interface AndroidColorDeclaration {
  readonly name: string
  readonly value: string | null
  readonly range: ColorSourceRange
  readonly nameRange: ColorSourceRange
}

export interface AndroidColorReference extends ColorSourceRange {
  readonly name: string
}

export interface AndroidResourceDocument {
  readonly declarations: readonly AndroidColorDeclaration[]
  readonly references: readonly AndroidColorReference[]
}

const RESOURCE_NAME = /^[A-Za-z_]\w*$/u
const COLOR_REFERENCE = /^@color\/(?<name>[A-Za-z_]\w*)$/u
const MAX_XML_ELEMENTS = 20_000
const MAX_XML_DEPTH = 128

/**
 * Parse a bounded XML subset without expanding entities or executing DTDs.
 * Offsets remain UTF-16 positions in the original source. Unsupported or
 * malformed markup rejects the document instead of hiding possible duplicates.
 */
export function parseAndroidResourceDocument(
  text: string,
  isValuesFile: boolean,
): AndroidResourceDocument | null {
  const elements = parseXmlElements(text)
  if (!elements || (isValuesFile && elements[0]?.name !== 'resources')) {
    return null
  }
  const declarations: AndroidColorDeclaration[] = []
  const references: AndroidColorReference[] = []
  for (const element of elements) {
    for (const [name, attribute] of element.attributes) {
      if (
        name === 'xmlns' ||
        name.startsWith('xmlns:') ||
        name.startsWith('tools:')
      ) {
        continue
      }
      const reference = parseReference(attribute.value, attribute.start)
      if (reference) {
        references.push(reference)
      }
    }
    const content = text.slice(element.contentStart, element.contentEnd)
    const value =
      element.hasChildren || content.includes('<') ? null : content.trim()
    if (value) {
      const reference = parseReference(content, element.contentStart)
      if (reference) {
        references.push(reference)
      }
    }
    if (
      isValuesFile &&
      element.parent === elements[0] &&
      element.name === 'item' &&
      element.attributes.get('type')?.value.includes('&')
    ) {
      return null
    }
    if (
      !isValuesFile ||
      element.parent !== elements[0] ||
      (element.name !== 'color' &&
        !(
          element.name === 'item' &&
          element.attributes.get('type')?.value === 'color'
        ))
    ) {
      continue
    }
    const name = element.attributes.get('name')
    if (!name || !RESOURCE_NAME.test(name.value)) {
      return null
    }
    declarations.push({
      name: name.value,
      value,
      range: { start: element.start, end: element.end },
      nameRange: { start: name.start, end: name.end },
    })
  }
  return { declarations, references }
}

/**
 * Recognize only complete, package-local color references.
 */
export function parseAndroidColorReference(value: string): string | null {
  return value.match(COLOR_REFERENCE)?.groups?.name ?? null
}

function parseReference(
  value: string,
  start: number,
): AndroidColorReference | null {
  const trimmed = value.trim()
  const name = parseAndroidColorReference(trimmed)
  if (!name) {
    return null
  }
  start += value.indexOf(trimmed)
  return { name, start, end: start + trimmed.length }
}

/**
 * Scan balanced tags and quoted attributes; comments never become elements.
 */
function parseXmlElements(text: string): XmlElement[] | null {
  const elements: XmlElement[] = []
  const stack: XmlElement[] = []
  let cursor = text.startsWith('\uFEFF') ? 1 : 0
  while (cursor < text.length) {
    const start = text.indexOf('<', cursor)
    const contentEnd = start === -1 ? text.length : start
    if (stack.length === 0 && text.slice(cursor, contentEnd).trim()) {
      return null
    }
    if (start === -1) {
      break
    }
    if (text.startsWith('<!--', start)) {
      const end = text.indexOf('-->', start + 4)
      if (end === -1 || text.slice(start + 4, end).includes('--')) {
        return null
      }
      cursor = end + 3
      continue
    }
    if (text.startsWith('<![CDATA[', start) && stack.length > 0) {
      const end = text.indexOf(']]>', start + 9)
      if (end === -1) {
        return null
      }
      cursor = end + 3
      continue
    }
    if (
      text.startsWith('<?xml ', start) &&
      elements.length === 0 &&
      stack.length === 0
    ) {
      const end = text.indexOf('?>', start + 6)
      if (end === -1) {
        return null
      }
      cursor = end + 2
      continue
    }
    const tagEnd = findTagEnd(text, start)
    if (tagEnd === -1) {
      return null
    }
    const tag = text.slice(start, tagEnd)
    cursor = tagEnd
    if (tag.startsWith('</')) {
      const name = tag.match(/^<\/(?<name>[A-Za-z_][\w.:-]*)\s*>$/u)?.groups
        ?.name
      const element = stack.pop()
      if (!element || element.name !== name) {
        return null
      }
      element.contentEnd = start
      element.end = cursor
      continue
    }
    const name = tag.match(/^<(?<name>[A-Za-z_][\w.:-]*)/u)?.groups?.name
    if (!name || (stack.length === 0 && elements.length > 0)) {
      return null
    }
    const attributes = parseAttributes(tag, name.length + 1, start)
    if (!attributes) {
      return null
    }
    const parent = stack.at(-1)
    if (parent) {
      parent.hasChildren = true
    }
    const element: XmlElement = {
      name,
      attributes,
      parent,
      start,
      end: cursor,
      contentStart: cursor,
      contentEnd: cursor,
      hasChildren: false,
    }
    elements.push(element)
    if (!tag.endsWith('/>')) {
      stack.push(element)
    }
    if (stack.length > MAX_XML_DEPTH || elements.length > MAX_XML_ELEMENTS) {
      return null
    }
  }
  return stack.length === 0 && elements.length > 0 ? elements : null
}

/**
 * Scan tag delimiters linearly, including malformed runs of names or quotes.
 */
function findTagEnd(text: string, start: number): number {
  let quote = ''
  for (let index = start + 1; index < text.length; index++) {
    const character = text[index]
    if (character === '<') {
      return -1
    }
    if (quote) {
      if (character === quote) {
        quote = ''
      }
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return index + 1
    }
  }
  return -1
}

function parseAttributes(
  tag: string,
  cursor: number,
  start: number,
): Map<string, XmlAttribute> | null {
  const attributes = new Map<string, XmlAttribute>()
  const pattern =
    /\s+(?<name>[A-Za-z_][\w.:-]*)\s*=\s*(?<quoted>"[^"<]*"|'[^'<]*')/uy
  while (!/^\s*\/?>$/u.test(tag.slice(cursor))) {
    pattern.lastIndex = cursor
    const match = pattern.exec(tag)
    const name = match?.groups?.name
    const quoted = match?.groups?.quoted
    if (!name || !quoted || attributes.has(name)) {
      return null
    }
    const value = quoted.slice(1, -1)
    const valueStart = start + pattern.lastIndex - quoted.length + 1
    attributes.set(name, {
      value,
      start: valueStart,
      end: valueStart + value.length,
    })
    cursor = pattern.lastIndex
  }
  return attributes
}
