import type { ColorDetector, StrategyContext } from '../../types'
import { findColorFunctions } from '../color-functions'
import { findHexRGBA, findHexARGB } from '../hex'
import { findHwb } from '../hwb'
import { findNamedColors } from '../named-colors'

type DirectColorContext = Partial<
  Pick<StrategyContext, 'languageId' | 'namedColorMatchMode' | 'useARGB'>
>

/**
 * Resolve a value that is exactly one supported color literal.
 *
 * @param value - Normalized literal value
 * @param context - Optional strategy context with parser settings
 * @returns Resolved rgb()/rgba() string, or null when the value is not a color
 */
export async function resolveDirectColor(
  value: string,
  context?: DirectColorContext,
): Promise<string | null> {
  const strategies: ColorDetector[] = [
    context?.useARGB ? findHexARGB : findHexRGBA,
    findColorFunctions,
    findHwb,
  ]
  if (context?.namedColorMatchMode !== 'never') {
    strategies.push(findNamedColors)
  }

  const detectorContext: StrategyContext | undefined = context?.languageId
    ? { ...context, languageId: context.languageId }
    : undefined
  const results = await Promise.all(
    strategies.map(strategy => strategy(value, detectorContext)),
  )
  const exactMatch = results
    .flat()
    .find(match => match.start === 0 && match.end === value.length)

  return exactMatch?.color ?? null
}
