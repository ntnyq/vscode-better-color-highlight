import { describe, expect, it } from 'vitest'
import { resolveLocalDesignTokenColors } from '../src/strategies/design-tokens/resolver'
import type {
  DesignTokenEntry,
  ParsedDesignTokenDocument,
} from '../src/strategies/design-tokens/types'

const red = { colorSpace: 'srgb', components: [1, 0, 0] }

function entry(
  path: readonly string[],
  rangeStart: number,
  options: Pick<DesignTokenEntry, 'reference' | 'type' | 'value'>,
): DesignTokenEntry {
  return {
    ...options,
    definitionRange: { start: rangeStart, end: rangeStart + 1 },
    path,
    range: { start: rangeStart, end: rangeStart + 3 },
  }
}

function document(
  root: unknown,
  tokens: readonly DesignTokenEntry[],
): ParsedDesignTokenDocument {
  return { root, tokens }
}

describe(resolveLocalDesignTokenColors, () => {
  it('resolves concrete, inherited, and chained curly aliases', () => {
    const tokens = [
      entry(['colors', 'red'], 0, { type: 'color', value: red }),
      entry(['semantic', 'brand'], 10, { value: '{colors.red}' }),
      entry(['semantic', 'link'], 20, { value: '{semantic.brand}' }),
    ]

    expect(resolveLocalDesignTokenColors(document({}, tokens))).toStrictEqual([
      { start: 0, end: 3, color: 'rgb(255, 0, 0)' },
      { start: 10, end: 13, color: 'rgb(255, 0, 0)' },
      { start: 20, end: 23, color: 'rgb(255, 0, 0)' },
    ])
  })

  it('resolves escaped JSON Pointer token values', () => {
    const root = {
      'brand/colors': {
        '~red': { $type: 'color', $value: red },
      },
    }
    const tokens = [
      entry(['brand/colors', '~red'], 0, { type: 'color', value: red }),
      entry(['semantic'], 10, {
        reference: '#/brand~1colors/~0red/$value',
        type: 'color',
      }),
    ]

    expect(resolveLocalDesignTokenColors(document(root, tokens))).toStrictEqual(
      [
        { start: 0, end: 3, color: 'rgb(255, 0, 0)' },
        { start: 10, end: 13, color: 'rgb(255, 0, 0)' },
      ],
    )
  })

  it('skips missing targets, type mismatches, and cycles', () => {
    const tokens = [
      entry(['colors', 'red'], 0, { type: 'color', value: red }),
      entry(['missing'], 10, { value: '{colors.missing}' }),
      entry(['wrongType'], 20, {
        type: 'dimension',
        value: '{colors.red}',
      }),
      entry(['cycleA'], 30, { value: '{cycleB}' }),
      entry(['cycleB'], 40, { value: '{cycleA}' }),
      entry(['badPointer'], 50, {
        reference: '#/colors/missing/$value',
        type: 'color',
      }),
    ]

    expect(resolveLocalDesignTokenColors(document({}, tokens))).toStrictEqual([
      { start: 0, end: 3, color: 'rgb(255, 0, 0)' },
    ])
  })
})
