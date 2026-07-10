import { getNodeValue, parseTree } from 'jsonc-parser'
import type { Node, ParseError } from 'jsonc-parser'
import type {
  DesignTokenEntry,
  DesignTokenRange,
  ParsedDesignTokenDocument,
} from './types'

/**
 * Parse JSON or JSONC into ranged, syntax-independent design token entries.
 *
 * @param text - JSON-family source text
 * @returns Parsed document, or null when syntax is invalid
 */
export function parseJsonDesignTokenDocument(
  text: string,
): ParsedDesignTokenDocument | null {
  const errors: ParseError[] = []
  const rootNode = parseTree(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  })
  if (!rootNode || rootNode.type !== 'object' || errors.length > 0) {
    return null
  }

  const tokens: DesignTokenEntry[] = []
  walkObject(rootNode, [], undefined, undefined, tokens)

  return {
    root: getNodeValue(rootNode),
    tokens,
  }
}

/** Walk one token group or token object. */
function walkObject(
  node: Node,
  path: readonly string[],
  inheritedType: string | undefined,
  definitionRange: DesignTokenRange | undefined,
  tokens: DesignTokenEntry[],
): void {
  const explicitType = getStringProperty(node, '$type')
  const effectiveType = explicitType ?? inheritedType
  const valueNode = getPropertyValueNode(node, '$value')
  const referenceNode = getPropertyValueNode(node, '$ref')

  if (valueNode || referenceNode) {
    tokens.push({
      definitionRange,
      path,
      range: getTokenRange(valueNode, referenceNode),
      reference:
        referenceNode?.type === 'string'
          ? (getNodeValue(referenceNode) as string)
          : undefined,
      type: effectiveType,
      value: valueNode ? getNodeValue(valueNode) : undefined,
    })
    return
  }

  for (const property of getObjectProperties(node)) {
    const [keyNode, childNode] = property.children ?? []
    const key = keyNode ? getNodeValue(keyNode) : undefined
    if (
      typeof key !== 'string' ||
      key === '$type' ||
      (key.startsWith('$') && key !== '$root') ||
      childNode?.type !== 'object'
    ) {
      continue
    }

    walkObject(
      childNode,
      key === '$root' ? path : [...path, key],
      effectiveType,
      getNodeContentRange(keyNode),
      tokens,
    )
  }
}

/** Choose the source expression highlighted for one token. */
function getTokenRange(
  valueNode: Node | undefined,
  referenceNode: Node | undefined,
): DesignTokenRange {
  if (referenceNode) {
    return getNodeContentRange(referenceNode)
  }

  if (!valueNode) {
    return { start: 0, end: 0 }
  }

  if (valueNode.type === 'object') {
    const componentsNode = getPropertyValueNode(valueNode, 'components')
    if (componentsNode) {
      return getNodeContentRange(componentsNode)
    }
  }

  return getNodeContentRange(valueNode)
}

/** Return a range excluding JSON string quote delimiters. */
function getNodeContentRange(node: Node): DesignTokenRange {
  const delimiterWidth = node.type === 'string' ? 1 : 0
  return {
    start: node.offset + delimiterWidth,
    end: node.offset + node.length - delimiterWidth,
  }
}

/** Read a string-valued object property. */
function getStringProperty(node: Node, key: string): string | undefined {
  const valueNode = getPropertyValueNode(node, key)
  return valueNode?.type === 'string'
    ? (getNodeValue(valueNode) as string)
    : undefined
}

/** Find a property value node by key. */
function getPropertyValueNode(node: Node, key: string): Node | undefined {
  for (const property of getObjectProperties(node)) {
    const [keyNode, valueNode] = property.children ?? []
    if (keyNode && getNodeValue(keyNode) === key) {
      return valueNode
    }
  }

  return undefined
}

/** Get property child nodes from an object AST node. */
function getObjectProperties(node: Node): readonly Node[] {
  return node.children?.filter(child => child.type === 'property') ?? []
}
