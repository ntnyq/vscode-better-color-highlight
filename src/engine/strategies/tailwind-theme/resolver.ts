import type { CssVarDeclaration } from '../css-vars/parser'
import { resolveTailwindColorValueImmediately } from './color'
import { createTailwindBasePalette } from './palette-v4'
import type {
  ParsedTailwindThemeSource,
  TailwindThemeDeclaration,
} from './parser'
import type {
  TailwindColorMode,
  TailwindColorTheme,
  TailwindRangedValue,
  TailwindThemeColor,
} from './types'

export interface ResolveTailwindThemeOptions {
  readonly mode?: TailwindColorMode
}

export type TailwindResolvedColor = TailwindThemeColor

interface ThemeValueDefinition {
  readonly inline: boolean
  readonly source?: TailwindRangedValue
  readonly value: string
}

interface ResolvedThemeValue {
  readonly source?: TailwindRangedValue
  readonly value: string
}

type ThemeCascadeEvent =
  | {
      readonly kind: 'reset'
    }
  | {
      readonly kind: 'remove'
      readonly name: string
    }
  | {
      readonly definition: ThemeValueDefinition
      readonly kind: 'set'
      readonly name: string
    }

const EXACT_VAR_REGEX = /^var\(\s*(?<name>--[-\w]+)\s*\)$/u
const MAX_ALIAS_DEPTH = 32

/** Merge parsed sources with the selected base palette and resolve colors. */
export function resolveTailwindTheme(
  sources: readonly ParsedTailwindThemeSource[],
  options: ResolveTailwindThemeOptions = {},
): Promise<TailwindColorTheme> {
  return Promise.resolve(resolveTailwindThemeImmediately(sources, options))
}

/** Synchronously merge parsed sources for detectors that do not load files. */
export function resolveTailwindThemeImmediately(
  sources: readonly ParsedTailwindThemeSource[],
  options: ResolveTailwindThemeOptions = {},
): TailwindColorTheme {
  const requestedMode = options.mode ?? 'auto'
  const hasV4Signal = sources.some(source => source.hasV4Signal)
  const mode = selectResolvedMode(requestedMode, hasV4Signal)
  const definitions = new Map<string, ThemeValueDefinition>()
  for (const [name, value] of createTailwindBasePalette(mode, hasV4Signal)) {
    definitions.set(name, { inline: false, value })
  }

  let hasColorNamespaceReset = false
  for (const event of createCascadeEvents(sources)) {
    if (event.kind === 'reset') {
      definitions.clear()
      hasColorNamespaceReset = true
    } else if (event.kind === 'remove') {
      definitions.delete(event.name)
    } else {
      definitions.set(event.name, event.definition)
    }
  }

  const customProperties = sources.flatMap(source => source.customProperties)
  const colors = new Map<string, TailwindThemeColor>()
  for (const [name, definition] of definitions) {
    const resolved = resolveDefinition(
      name,
      definition,
      definitions,
      customProperties,
      new Set(),
      0,
    )
    if (resolved) {
      colors.set(name, resolved)
    }
  }

  return {
    colors,
    hasColorNamespaceReset,
    hasV4Signal,
    mode,
  }
}

/** Resolve one utility color name from an already resolved theme. */
export function resolveTailwindThemeColor(
  theme: TailwindColorTheme,
  name: string,
): Promise<TailwindResolvedColor | null> {
  return Promise.resolve(theme.colors.get(name) ?? null)
}

function createCascadeEvents(
  sources: readonly ParsedTailwindThemeSource[],
): ThemeCascadeEvent[] {
  const events: ThemeCascadeEvent[] = []
  for (const source of sources) {
    for (const declaration of source.themeDeclarations) {
      const event = createCascadeEvent(declaration)
      if (event) {
        events.push(event)
      }
    }
  }
  return events
}

function createCascadeEvent(
  declaration: TailwindThemeDeclaration,
): ThemeCascadeEvent | null {
  const semanticValue = normalizeSemanticValue(declaration.value)
  if (declaration.name === '--*' || declaration.name === '--color-*') {
    return semanticValue === 'initial' ? { kind: 'reset' } : null
  }
  if (!declaration.name.startsWith('--color-')) {
    return null
  }

  const name = declaration.name.slice('--color-'.length)
  if (!name) {
    return null
  }
  if (semanticValue === 'initial') {
    return { kind: 'remove', name }
  }
  return {
    kind: 'set',
    name,
    definition: {
      inline: declaration.inline,
      source: {
        filePath: declaration.filePath,
        range: declaration.range,
        value: declaration.value,
        valueRange: declaration.valueRange,
      },
      value: declaration.value,
    },
  }
}

function resolveDefinition(
  name: string,
  definition: ThemeValueDefinition,
  definitions: ReadonlyMap<string, ThemeValueDefinition>,
  customProperties: readonly CssVarDeclaration[],
  stack: Set<string>,
  depth: number,
): ResolvedThemeValue | null {
  if (depth >= MAX_ALIAS_DEPTH || stack.has(`theme:${name}`)) {
    return null
  }

  const semanticValue = normalizeSemanticValue(definition.value)
  const direct = resolveTailwindColorValueImmediately(semanticValue)
  if (direct) {
    return {
      value: direct,
      ...(definition.source ? { source: definition.source } : {}),
    }
  }

  const alias = EXACT_VAR_REGEX.exec(semanticValue)?.groups?.name
  if (!alias) {
    return null
  }

  const nextStack = new Set(stack).add(`theme:${name}`)
  if (alias.startsWith('--color-')) {
    const targetName = alias.slice('--color-'.length)
    const target = definitions.get(targetName)
    return target
      ? resolveDefinition(
          targetName,
          target,
          definitions,
          customProperties,
          nextStack,
          depth + 1,
        )
      : null
  }

  return definition.inline
    ? resolveRegularProperty(
        alias,
        definitions,
        customProperties,
        nextStack,
        depth + 1,
      )
    : null
}

function resolveRegularProperty(
  name: string,
  definitions: ReadonlyMap<string, ThemeValueDefinition>,
  customProperties: readonly CssVarDeclaration[],
  stack: Set<string>,
  depth: number,
): ResolvedThemeValue | null {
  if (depth >= MAX_ALIAS_DEPTH || stack.has(`property:${name}`)) {
    return null
  }

  const declaration = selectRegularProperty(name, customProperties)
  if (!declaration) {
    return null
  }
  const semanticValue = normalizeSemanticValue(declaration.value)
  const direct = resolveTailwindColorValueImmediately(semanticValue)
  if (direct) {
    return {
      value: direct,
      source: {
        filePath: declaration.filePath,
        range: {
          start: declaration.nameRange.start,
          end: declaration.valueRange.end,
        },
        value: declaration.value,
        valueRange: declaration.valueRange,
      },
    }
  }

  const alias = EXACT_VAR_REGEX.exec(semanticValue)?.groups?.name
  if (!alias) {
    return null
  }
  const nextStack = new Set(stack).add(`property:${name}`)
  if (alias.startsWith('--color-')) {
    const targetName = alias.slice('--color-'.length)
    const target = definitions.get(targetName)
    return target
      ? resolveDefinition(
          targetName,
          target,
          definitions,
          customProperties,
          nextStack,
          depth + 1,
        )
      : null
  }
  return resolveRegularProperty(
    alias,
    definitions,
    customProperties,
    nextStack,
    depth + 1,
  )
}

function selectRegularProperty(
  name: string,
  declarations: readonly CssVarDeclaration[],
): CssVarDeclaration | null {
  const candidates = declarations.filter(
    declaration => declaration.name === name,
  )
  if (candidates.length === 0) {
    return null
  }

  const contexts = new Set(
    candidates.map(declaration =>
      JSON.stringify([declaration.selectorContext, declaration.atRuleContext]),
    ),
  )
  return contexts.size === 1 ? (candidates.at(-1) ?? null) : null
}

function selectResolvedMode(
  mode: TailwindColorMode,
  hasV4Signal: boolean,
): Exclude<TailwindColorMode, 'auto'> {
  if (mode !== 'auto') {
    return mode
  }
  return hasV4Signal ? 'v4' : 'v3'
}

function normalizeSemanticValue(value: string): string {
  return value.replaceAll(/\/\*[\s\S]*?\*\//gu, ' ').trim()
}
