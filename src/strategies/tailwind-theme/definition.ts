import type { ColorDefinitionTarget, StrategyContext } from '../../types'
import type { ParsedTailwindThemeSource } from './parser'
import { resolveTailwindTheme } from './resolver'
import { loadTailwindThemeSources } from './sources'
import type { TailwindRangedValue, TailwindSourceRange } from './types'
import {
  findTailwindColorUtilities,
  type TailwindColorUtility,
} from './utility'

/** Resolve a Tailwind color utility to its final workspace declaration. */
export async function resolveTailwindColorDefinition(
  text: string,
  offset: number,
  context: StrategyContext,
): Promise<ColorDefinitionTarget | null> {
  const utility = findUtilityAtOffset(text, offset)
  const name = utility ? getThemeColorName(utility) : null
  if (!utility || !name) {
    return null
  }

  const sources = await loadTailwindThemeSources(text, context)
  const theme = await resolveTailwindTheme(sources, {
    mode: context.tailwindColorMode,
  })
  const source = theme.colors.get(name)?.source
  if (!source?.filePath) {
    return null
  }

  const selectionRange = findSourceNameRange(sources, source)
  if (!selectionRange) {
    return null
  }

  return {
    originRange: { start: utility.start, end: utility.end },
    targetFilePath: source.filePath,
    targetRange: source.range,
    targetSelectionRange: selectionRange,
  }
}

function findUtilityAtOffset(
  text: string,
  offset: number,
): TailwindColorUtility | null {
  return (
    findTailwindColorUtilities(text).find(
      utility => offset >= utility.start && offset < utility.end,
    ) ?? null
  )
}

function getThemeColorName(utility: TailwindColorUtility): string | null {
  if (utility.kind === 'named') {
    return utility.value
  }
  return utility.kind === 'property' &&
    utility.value.startsWith('--color-') &&
    utility.value.length > '--color-'.length
    ? utility.value.slice('--color-'.length)
    : null
}

function findSourceNameRange(
  sources: readonly ParsedTailwindThemeSource[],
  target: TailwindRangedValue,
): TailwindSourceRange | null {
  for (const source of sources) {
    if (source.filePath !== target.filePath) {
      continue
    }
    for (const declaration of source.themeDeclarations) {
      if (sameRange(declaration.range, target.range)) {
        return declaration.nameRange
      }
    }
    for (const declaration of source.customProperties) {
      const range = {
        start: declaration.nameRange.start,
        end: declaration.valueRange.end,
      }
      if (sameRange(range, target.range)) {
        return declaration.nameRange
      }
    }
  }
  return null
}

function sameRange(
  left: TailwindSourceRange,
  right: TailwindSourceRange,
): boolean {
  return left.start === right.start && left.end === right.end
}
