import { isMap, isScalar, parseDocument } from 'yaml'
import type { Node, Pair, YAMLMap } from 'yaml'
import type {
  DesignTokenEntry,
  DesignTokenRange,
  ParsedDesignTokenDocument,
} from './types'

/**
 * Parse YAML into ranged, syntax-independent design token entries.
 *
 * @param text - YAML source text
 * @returns Parsed document, or null when syntax is invalid
 */
export function parseYamlDesignTokenDocument(
  text: string,
): ParsedDesignTokenDocument | null {
  try {
    const document = parseDocument(text, {
      prettyErrors: false,
      strict: true,
    })
    if (document.errors.length > 0 || !isMap(document.contents)) {
      return null
    }

    const tokens: DesignTokenEntry[] = []
    walkMap(document.contents, [], undefined, tokens, text)

    return {
      root: document.toJS({ maxAliasCount: 100 }),
      tokens,
    }
  } catch {
    return null
  }
}

/** Walk one token group or token object. */
function walkMap(
  node: YAMLMap,
  path: readonly string[],
  inheritedType: string | undefined,
  tokens: DesignTokenEntry[],
  text: string,
): void {
  const explicitType = getStringProperty(node, '$type')
  const effectiveType = explicitType ?? inheritedType
  const valueNode = getPropertyValueNode(node, '$value')
  const referenceNode = getPropertyValueNode(node, '$ref')

  if (valueNode || referenceNode) {
    tokens.push({
      path,
      range: getTokenRange(valueNode, referenceNode, text),
      reference:
        referenceNode && isScalar(referenceNode)
          ? getStringValue(referenceNode.value)
          : undefined,
      type: effectiveType,
      value: valueNode?.toJSON(),
    })
    return
  }

  for (const pair of node.items) {
    const key = getPairKey(pair)
    if (
      !key ||
      key === '$type' ||
      (key.startsWith('$') && key !== '$root') ||
      !isMap(pair.value)
    ) {
      continue
    }

    walkMap(
      pair.value,
      key === '$root' ? path : [...path, key],
      effectiveType,
      tokens,
      text,
    )
  }
}

/** Choose the source expression highlighted for one token. */
function getTokenRange(
  valueNode: Node | null | undefined,
  referenceNode: Node | null | undefined,
  text: string,
): DesignTokenRange {
  if (referenceNode) {
    return getNodeContentRange(referenceNode, text)
  }

  if (!valueNode) {
    return { start: 0, end: 0 }
  }

  if (isMap(valueNode)) {
    const componentsNode = getPropertyValueNode(valueNode, 'components')
    if (componentsNode) {
      return getNodeContentRange(componentsNode, text)
    }
  }

  return getNodeContentRange(valueNode, text)
}

/** Return a range excluding YAML scalar quote delimiters and comments. */
function getNodeContentRange(node: Node, text: string): DesignTokenRange {
  const [start, valueEnd] = node.range ?? [0, 0, 0]
  const first = text[start]
  const quoted = isScalar(node) && (first === '"' || first === "'")
  let end = valueEnd - (quoted ? 1 : 0)
  if (!quoted) {
    while (end > start && /\s/u.test(text[end - 1] ?? '')) {
      end--
    }
  }

  return {
    start: start + (quoted ? 1 : 0),
    end,
  }
}

/** Read a string-valued map property. */
function getStringProperty(node: YAMLMap, key: string): string | undefined {
  const valueNode = getPropertyValueNode(node, key)
  return valueNode && isScalar(valueNode)
    ? getStringValue(valueNode.value)
    : undefined
}

/** Find a map property value node by key. */
function getPropertyValueNode(
  node: YAMLMap,
  key: string,
): Node | null | undefined {
  return node.items.find(pair => getPairKey(pair) === key)?.value as
    | Node
    | null
    | undefined
}

/** Read a scalar pair key. */
function getPairKey(pair: Pair): string | undefined {
  return isScalar(pair.key) ? getStringValue(pair.key.value) : undefined
}

/** Narrow an unknown scalar value to a string. */
function getStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
