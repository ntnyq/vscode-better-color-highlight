import type { StrategyContext } from '../types'
import { findCssContrastPairs } from './css-pairs'
import { findTailwindContrastPairs } from './tailwind-pairs'
import type { ResolvedContrastPair } from './types'

const MAX_SOURCE_LENGTH = 512 * 1024

/** Find deterministic same-context foreground/background color pairs. */
export async function findContrastPairs(
  text: string,
  context: StrategyContext,
): Promise<readonly ResolvedContrastPair[]> {
  if (text.length > MAX_SOURCE_LENGTH) {
    return []
  }

  if (context.signal?.isCancellationRequested) {
    return []
  }

  const cssPairs = await findCssContrastPairs(text, context)
  if (context.signal?.isCancellationRequested) {
    return []
  }
  const tailwindPairs = await findTailwindContrastPairs(text, context)
  if (context.signal?.isCancellationRequested) {
    return []
  }
  const results = [cssPairs, tailwindPairs]
  const seen = new Set<string>()
  return results
    .flat()
    .sort((left, right) => pairStart(left) - pairStart(right))
    .filter(pair => {
      const key = [
        pair.contextKey,
        pair.foreground.range.start,
        pair.foreground.range.end,
        pair.background.range.start,
        pair.background.range.end,
      ].join(':')
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

function pairStart(pair: ResolvedContrastPair): number {
  return Math.min(pair.foreground.range.start, pair.background.range.start)
}
