import type { ColorDefinitionTarget, ColorSourceRange } from '../../types'

export interface RangedVariableDefinition {
  readonly name: string
  readonly value: string
  readonly filePath: string
  readonly nameRange: ColorSourceRange
  readonly valueRange: ColorSourceRange
}

export interface VariableUsage {
  readonly name: string
  readonly originRange: ColorSourceRange
}

export interface CapturedVariableValue {
  readonly value: string
  readonly valueRange: ColorSourceRange
}

/** Locate and trim a captured declaration value after its assignment delimiter. */
export function getCapturedVariableValue(
  match: RegExpMatchArray,
  rawValue: string,
  searchStart: number,
): CapturedVariableValue {
  const relativeStart = match[0].indexOf(rawValue, searchStart)
  const leadingWhitespace = rawValue.length - rawValue.trimStart().length
  const value = rawValue.trim()
  const start = (match.index ?? 0) + relativeStart + leadingWhitespace

  return {
    value,
    valueRange: { start, end: start + value.length },
  }
}

/** Resolve an alias chain and return its final color-valued declaration. */
export async function resolveRangedVariableDefinition(
  initialName: string,
  definitions: ReadonlyMap<string, RangedVariableDefinition>,
  getAlias: (value: string) => string | null,
  isColor: (value: string, name: string) => Promise<boolean>,
): Promise<RangedVariableDefinition | null> {
  const seen = new Set<string>()
  let name = initialName

  while (!seen.has(name)) {
    seen.add(name)
    const definition = definitions.get(name)
    if (!definition) {
      return null
    }

    const normalized = definition.value.replaceAll(/!important\b/gu, '').trim()
    if (await isColor(normalized, name)) {
      return definition
    }

    const alias = getAlias(normalized)
    if (!alias) {
      return null
    }
    name = alias
  }

  return null
}

export function toColorDefinitionTarget(
  usage: VariableUsage,
  definition: RangedVariableDefinition,
): ColorDefinitionTarget {
  return {
    originRange: usage.originRange,
    targetFilePath: definition.filePath,
    targetRange: {
      start: definition.nameRange.start,
      end: definition.valueRange.end,
    },
    targetSelectionRange: definition.nameRange,
  }
}
