import type { ColorDefinitionTarget } from '../definition/types'
import type { ColorMatch, StrategyContext } from '../detection'
import { resolveDirectColor } from './shared/direct-color'
import { toColorDefinitionTarget } from './shared/variable-definition'
import type {
  RangedVariableDefinition,
  VariableUsage,
} from './shared/variable-definition'

interface LessScope {
  readonly parent?: LessScope
  readonly definitions: Map<string, RangedVariableDefinition>
}

interface ScopedLessUsage extends VariableUsage {
  readonly scope: LessScope
}

interface ResolvedLessVariable {
  readonly color: string
  readonly definition: RangedVariableDefinition
}

const LESS_TOKEN_REGEX =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*(?:"|$)|'(?:\\[\s\S]|[^'\\])*(?:'|$)|@(?<name>[-\w]+)|[{}();[\]]/gu

/**
 * Collect lexical scopes before resolving references so the final assignment
 * in each scope is visible even to earlier usages (Less lazy evaluation).
 */
function collectLessVarUsages(
  text: string,
  filePath: string,
): ScopedLessUsage[] {
  let scope: LessScope = { definitions: new Map() }
  let scopeDepth = 0
  let expressionDepth = 0
  let pending:
    | {
        readonly name: string
        readonly start: number
        readonly valueStart: number
      }
    | undefined
  const usages: ScopedLessUsage[] = []

  function assign(end: number): void {
    if (!pending) {
      return
    }
    const { name, start, valueStart } = pending
    const rawValue = text.slice(valueStart, end)
    const value = rawValue.trim()
    const offset = valueStart + rawValue.length - rawValue.trimStart().length
    scope.definitions.set(name, {
      name,
      value,
      filePath,
      nameRange: { start, end: start + name.length + 1 },
      valueRange: { start: offset, end: offset + value.length },
    })
    pending = undefined
  }

  for (const token of text.matchAll(LESS_TOKEN_REGEX)) {
    const source = token[0]
    const start = token.index
    if (
      source.startsWith('/') ||
      source.startsWith('"') ||
      source.startsWith("'")
    ) {
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
    if (source === '{' && expressionDepth === 0) {
      if (++scopeDepth > 256) {
        return []
      }
      pending = undefined
      scope = { parent: scope, definitions: new Map() }
      continue
    }
    if ((source === ';' || source === '}') && expressionDepth === 0) {
      assign(start)
      if (source === '}' && scope.parent) {
        scope = scope.parent
        scopeDepth--
      }
      continue
    }
    const name = token.groups?.name
    if (!name || /[-\w@]/u.test(text[start - 1] ?? '')) {
      continue
    }
    const end = start + source.length
    const colon = text.slice(end).match(/^\s*:\s*/u)
    if (colon) {
      if (!pending && expressionDepth === 0) {
        pending = { name, start, valueStart: end + colon[0].length }
      }
      continue
    }
    usages.push({ name, originRange: { start, end }, scope })
  }
  assign(text.length)
  return usages
}

/**
 * Resolve aliases in the reference's scope, caching each scoped name once.
 * An inherited alias can refer to a variable overridden in the child scope.
 */
function createLessVarResolver(context?: Partial<StrategyContext>) {
  const resolutions = new Map<
    LessScope,
    Map<string, ResolvedLessVariable | null>
  >()
  const literalColors = new Map<RangedVariableDefinition, string | null>()
  return async (
    usage: ScopedLessUsage,
  ): Promise<ResolvedLessVariable | null> => {
    let cache = resolutions.get(usage.scope)
    if (!cache) {
      cache = new Map()
      resolutions.set(usage.scope, cache)
    }
    const path = new Set<string>()
    let name: string | undefined = usage.name
    let resolved: ResolvedLessVariable | null = null
    while (name !== undefined && !path.has(name)) {
      if (context?.signal?.isCancellationRequested) {
        return null
      }
      if (cache.has(name)) {
        resolved = cache.get(name) ?? null
        break
      }
      path.add(name)
      let scope: LessScope | undefined = usage.scope
      while (scope && !scope.definitions.has(name)) {
        scope = scope.parent
      }
      const definition: RangedVariableDefinition | undefined =
        scope?.definitions.get(name)
      if (!definition) {
        break
      }
      const value: string = definition.value
        .replaceAll(/!important\b/gu, '')
        .trim()
      const alias: string | undefined =
        value.match(/^@(?<name>[-\w]+)$/u)?.groups?.name
      if (alias) {
        name = alias
        continue
      }
      if (!literalColors.has(definition)) {
        literalColors.set(definition, await resolveDirectColor(value, context))
      }
      const color = literalColors.get(definition)
      resolved = color ? { color, definition } : null
      break
    }
    for (const visited of path) {
      cache.set(visited, resolved)
    }
    return context?.signal?.isCancellationRequested ? null : resolved
  }
}

/**
 * Resolve a LESS reference to its color definition through scoped aliases.
 */
export async function resolveLessVarDefinition(
  text: string,
  offset: number,
  context?: Partial<StrategyContext>,
): Promise<ColorDefinitionTarget | null> {
  const usage = collectLessVarUsages(text, context?.filePath ?? '').find(
    item => offset >= item.originRange.start && offset < item.originRange.end,
  )
  if (!usage) {
    return null
  }
  const resolved = await createLessVarResolver(context)(usage)
  return resolved ? toColorDefinitionTarget(usage, resolved.definition) : null
}

/**
 * Detect Less variable colors using the nearest scope's final assignments.
 */
export async function findLessVars(
  text: string,
  context?: StrategyContext,
): Promise<ColorMatch[]> {
  const usages = collectLessVarUsages(text, context?.filePath ?? '')
  const resolve = createLessVarResolver(context)
  const matches: ColorMatch[] = []
  for (const usage of usages) {
    const resolved = await resolve(usage)
    if (context?.signal?.isCancellationRequested) {
      return []
    }
    if (resolved) {
      matches.push({ ...usage.originRange, color: resolved.color })
    }
  }
  return matches
}
