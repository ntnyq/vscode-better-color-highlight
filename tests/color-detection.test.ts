import { describe, expect, it, vi } from 'vitest'
import { runColorDetectors } from '../src/core/color-detection'
import type { ColorDetector, ColorMatch, StrategyContext } from '../src/types'

const context: StrategyContext = { languageId: 'css' }
const red: ColorMatch = { start: 0, end: 7, color: 'rgb(255, 0, 0)' }
const blue: ColorMatch = { start: 10, end: 17, color: 'rgb(0, 0, 255)' }
const firstDetector: ColorDetector = () => [red]
const failingDetector: ColorDetector = () => {
  throw new Error('broken fixture')
}
const secondDetector: ColorDetector = () => Promise.resolve([blue])

describe(runColorDetectors, () => {
  it('flattens successful results and isolates detector failures', async () => {
    const onDetectorError = vi.fn<(message: string) => void>()
    const onDetectorResult =
      vi.fn<(name: string, matches: readonly ColorMatch[]) => void>()

    await expect(
      runColorDetectors({
        context,
        detectors: [firstDetector, failingDetector, secondDetector],
        onDetectorError,
        onDetectorResult,
        text: '#ff0000 #0000ff',
      }),
    ).resolves.toStrictEqual([red, blue])

    expect(onDetectorError).toHaveBeenCalledExactlyOnceWith(
      'Color detector "failingDetector" failed: Error: broken fixture',
    )
    expect(onDetectorResult.mock.calls).toStrictEqual([
      ['firstDetector', [red]],
      ['secondDetector', [blue]],
    ])
  })

  it('does not start another detector after cancellation at an async boundary', async () => {
    let cancelled = false
    const deferred = Promise.withResolvers<ColorMatch[]>()
    const first = vi.fn<ColorDetector>(() => deferred.promise)
    const second = vi.fn<ColorDetector>(() => [blue])
    const promise = runColorDetectors({
      context: {
        ...context,
        signal: {
          get isCancellationRequested() {
            return cancelled
          },
        },
      },
      detectors: [first, second],
      text: '#ff0000 #0000ff',
    })

    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1))
    cancelled = true
    deferred.resolve([red])

    await expect(promise).resolves.toStrictEqual([])
    expect(second).not.toHaveBeenCalled()
  })
})
