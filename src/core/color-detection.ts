import type { ColorDetector, ColorMatch, StrategyContext } from '../types'

/**
 * Inputs for one concurrent detector run.
 */
export interface RunColorDetectorsOptions {
  /** Context shared by every detector. */
  readonly context: StrategyContext

  /** Detectors applicable to the current document. */
  readonly detectors: readonly ColorDetector[]

  /** Optional isolated detector failure reporter. */
  readonly onDetectorError?: (message: string) => void

  /** Optional successful detector result observer. */
  readonly onDetectorResult?: (
    name: string,
    matches: readonly ColorMatch[],
  ) => void

  /** Full source text passed to every detector. */
  readonly text: string
}

/**
 * Run color detectors concurrently while isolating individual failures.
 *
 * @param options - Detector inputs and optional observers
 * @returns Flattened successful matches in detector order
 */
export async function runColorDetectors({
  context,
  detectors,
  onDetectorError,
  onDetectorResult,
  text,
}: RunColorDetectorsOptions): Promise<ColorMatch[]> {
  const results = await Promise.all(
    detectors.map(async detector => {
      const detectorName = detector.name || 'anonymous'

      try {
        const matches = await detector(text, context)
        onDetectorResult?.(detectorName, matches)
        return matches
      } catch (error) {
        onDetectorError?.(
          `Color detector "${detectorName}" failed: ${String(error)}`,
        )
        return []
      }
    }),
  )

  return results.flat()
}
