import type {
  RangedVariableDefinition,
  VariableUsage,
} from '../shared/variable-definition'

interface ScssScope {
  readonly definitions: Map<string, RangedVariableDefinition>
  readonly kind: 'static' | 'dynamic' | 'deferred'
}

export interface BoundScssUsage extends VariableUsage {
  readonly definition: RangedVariableDefinition
}

const TOKEN_REGEX =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|(?:(?<namespace>[-\w]+)\.)?\$(?<name>[-\w]+)|[{}();[\]]/gu

const MAX_SCOPE_DEPTH = 256

/**
 * Bind references in source order. Aliases retain their value at assignment,
 * and only the root scope is exported to importing stylesheets.
 */
export function bindScssVariables(
  text: string,
  filePath: string,
  initialDefinitions: ReadonlyMap<string, RangedVariableDefinition> = new Map(),
): {
  readonly definitions: Map<string, RangedVariableDefinition>
  readonly usages: readonly BoundScssUsage[]
} {
  const root: ScssScope = {
    definitions: new Map(initialDefinitions),
    kind: 'static',
  }
  const scopes = [root]
  const usages: BoundScssUsage[] = []
  let statementStart = 0
  let expressionDepth = 0
  let pending:
    | {
        readonly name: string
        readonly start: number
        readonly valueStart: number
      }
    | undefined

  function currentScope(): ScssScope {
    return scopes[scopes.length - 1]
  }

  function lookup(name: string): RangedVariableDefinition | undefined {
    for (let index = scopes.length - 1; index >= 0; index--) {
      const definition = scopes[index].definitions.get(name)
      if (definition) {
        return definition
      }
    }
    return undefined
  }

  function assign(end: number): void {
    if (!pending) {
      return
    }
    const { name, start, valueStart } = pending
    pending = undefined
    const rawValue = text.slice(valueStart, end)
    let value = rawValue.trim()
    let isDefault = false
    let isGlobal = false
    for (let index = 0; index < 2; index++) {
      const flag = value.match(/\s*!(?<flag>default|global)\s*$/u)
      if (!flag) {
        break
      }
      isDefault ||= flag.groups?.flag === 'default'
      isGlobal ||= flag.groups?.flag === 'global'
      value = value.slice(0, flag.index).trimEnd()
    }
    const scope = currentScope()
    if (scope.kind === 'deferred') {
      return
    }
    const previous = isGlobal ? root.definitions.get(name) : lookup(name)
    if (isDefault && previous && previous.value !== 'null') {
      return
    }
    const valueOffset =
      valueStart + rawValue.length - rawValue.trimStart().length
    const declaration: RangedVariableDefinition = {
      name,
      filePath,
      nameRange: { start, end: start + name.length + 1 },
      valueRange: { start: valueOffset, end: valueOffset + value.length },
      value: value.replaceAll(/!important\b/gu, '').trim(),
    }
    const alias = declaration.value.match(
      /^(?:(?<namespace>[-\w]+)\.)?\$(?<name>[-\w]+)$/u,
    )?.groups
    const target = alias
      ? lookup(`${alias.namespace ? `${alias.namespace}.` : ''}${alias.name}`)
      : declaration
    if (scope.kind === 'dynamic') {
      // Control-flow assignment may mutate an outer binding. Its outcome is
      // unknown without executing Sass, so invalidate that binding instead.
      const owner = isGlobal
        ? root
        : scopes.findLast(item => item.definitions.has(name))
      owner?.definitions.set(name, { ...declaration, value: '' })
      return
    }
    const owner = isGlobal ? root : scope
    owner.definitions.set(name, target ?? { ...declaration, value: '' })
  }

  for (const token of text.matchAll(TOKEN_REGEX)) {
    const source = token[0]
    const start = token.index
    if (source.startsWith('//') || source.startsWith('/*')) {
      if (!text.slice(statementStart, start).trim()) {
        statementStart = start + source.length
      }
      continue
    }
    if (source.startsWith('"') || source.startsWith("'")) {
      continue
    }
    if (source === '(' || source === '[') {
      expressionDepth++
      continue
    }
    if (source === ')' || source === ']') {
      expressionDepth = Math.max(0, expressionDepth - 1)
      continue
    }
    if (source === ';' || source === '}') {
      if (expressionDepth > 0) {
        continue
      }
      assign(start)
      if (source === '}' && scopes.length > 1) {
        scopes.pop()
      }
      statementStart = start + 1
      continue
    }
    if (source === '{') {
      if (scopes.length >= MAX_SCOPE_DEPTH) {
        return { definitions: new Map(), usages: [] }
      }
      const prelude = text.slice(statementStart, start)
      let kind = currentScope().kind
      if (kind === 'static') {
        if (/@(?:mixin|function|include)\b/u.test(prelude)) {
          kind = 'deferred'
        } else if (/@(?:if|else|each|for|while)\b/u.test(prelude)) {
          kind = 'dynamic'
        }
      }
      scopes.push({ definitions: new Map(), kind })
      statementStart = start + 1
      continue
    }
    const name = token.groups?.name
    if (!name || /[-\w$.]/u.test(text[start - 1] ?? '')) {
      continue
    }
    const namespace = token.groups?.namespace
    const end = start + source.length
    const colon = text.slice(end).match(/^\s*:\s*/u)
    if (colon && !namespace && expressionDepth === 0 && !pending) {
      pending = { name, start, valueStart: end + colon[0].length }
      continue
    }
    if (colon || currentScope().kind !== 'static') {
      continue
    }
    const definition = lookup(namespace ? `${namespace}.${name}` : name)
    if (definition) {
      usages.push({ name, originRange: { start, end }, definition })
    }
  }
  return { definitions: root.definitions, usages }
}
