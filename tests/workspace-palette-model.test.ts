import { describe, expect, it } from 'vitest'
import { groupWorkspaceColorOccurrences } from '../src/workspace-palette/model'
import type { WorkspaceColorOccurrence } from '../src/workspace-palette/types'

const scanStats = {
  occurrenceTruncated: false,
  scannedFileCount: 2,
  skippedFileCount: 1,
  truncated: false,
} as const

function occurrence(
  uri: string,
  start: number,
  end: number,
  sourceText: string,
  color: string,
): WorkspaceColorOccurrence {
  return { color, end, sourceText, start, uri }
}

describe(groupWorkspaceColorOccurrences, () => {
  it('groups canonical colors and deduplicates identical locations', () => {
    const result = groupWorkspaceColorOccurrences(
      [
        occurrence('file:///b.css', 9, 13, 'red', 'rgb(255, 0, 0)'),
        occurrence('file:///a.css', 2, 6, '#f00', 'rgb(255, 0, 0)'),
        occurrence('file:///a.css', 2, 6, '#f00', 'rgb(255, 0, 0)'),
        occurrence('file:///a.css', 2, 6, '#f00', 'rgb(0, 0, 0)'),
      ],
      scanStats,
    )

    expect(result.groups).toHaveLength(2)
    expect(result.groups[0]).toMatchObject({
      color: 'rgb(255, 0, 0)',
      presentations: {
        hex: '#ff0000',
        rgb: 'rgb(255, 0, 0)',
      },
    })
    expect(result.groups[0].occurrences).toStrictEqual([
      occurrence('file:///a.css', 2, 6, '#f00', 'rgb(255, 0, 0)'),
      occurrence('file:///b.css', 9, 13, 'red', 'rgb(255, 0, 0)'),
    ])
  })

  it('preserves exact source text and generates translucent presentations', () => {
    const result = groupWorkspaceColorOccurrences(
      [
        occurrence(
          'file:///colors.css',
          4,
          26,
          'RGB(255 0 0 / 50%)',
          'rgba(255, 0, 0, 0.5)',
        ),
      ],
      scanStats,
    )

    expect(result.groups[0].occurrences[0].sourceText).toBe(
      'RGB(255 0 0 / 50%)',
    )
    expect(result.groups[0].presentations).toMatchObject({
      alpha: '50%',
      hex: '#ff000080',
      hsl: 'hsl(0 100% 50% / 0.5)',
      oklch: 'oklch(62.8% 0.258 29.2 / 0.5)',
      rgb: 'rgba(255, 0, 0, 0.5)',
    })
  })

  it('orders groups by count and breaks ties by canonical color', () => {
    const result = groupWorkspaceColorOccurrences(
      [
        occurrence('file:///a.css', 0, 3, 'red', 'rgb(255, 0, 0)'),
        occurrence('file:///a.css', 4, 8, 'blue', 'rgb(0, 0, 255)'),
        occurrence('file:///b.css', 0, 4, 'blue', 'rgb(0, 0, 255)'),
        occurrence('file:///a.css', 9, 14, 'black', 'rgb(0, 0, 0)'),
      ],
      scanStats,
    )

    expect(result.groups.map(group => group.color)).toStrictEqual([
      'rgb(0, 0, 255)',
      'rgb(0, 0, 0)',
      'rgb(255, 0, 0)',
    ])
  })

  it('orders occurrences by URI and then source offset', () => {
    const result = groupWorkspaceColorOccurrences(
      [
        occurrence('file:///b.css', 1, 5, '#f00', 'rgb(255, 0, 0)'),
        occurrence('file:///a.css', 20, 24, '#f00', 'rgb(255, 0, 0)'),
        occurrence('file:///a.css', 2, 6, '#f00', 'rgb(255, 0, 0)'),
      ],
      scanStats,
    )

    expect(
      result.groups[0].occurrences.map(({ start, uri }) => [uri, start]),
    ).toStrictEqual([
      ['file:///a.css', 2],
      ['file:///a.css', 20],
      ['file:///b.css', 1],
    ])
  })

  it('counts occurrences and distinct files per group', () => {
    const result = groupWorkspaceColorOccurrences(
      [
        occurrence('file:///a.css', 0, 4, '#f00', 'rgb(255, 0, 0)'),
        occurrence('file:///a.css', 8, 12, '#f00', 'rgb(255, 0, 0)'),
        occurrence('file:///b.css', 0, 3, 'red', 'rgb(255, 0, 0)'),
      ],
      scanStats,
    )

    expect(result.groups[0].occurrences).toHaveLength(3)
    expect(
      new Set(result.groups[0].occurrences.map(item => item.uri)).size,
    ).toBe(2)
  })

  it('rejects unsupported canonical colors', () => {
    const result = groupWorkspaceColorOccurrences(
      [occurrence('file:///a.css', 0, 7, 'current', 'currentColor')],
      scanStats,
    )

    expect(result.groups).toStrictEqual([])
  })

  it('returns empty groups and propagates scan metadata', () => {
    expect(
      groupWorkspaceColorOccurrences([], {
        scannedFileCount: 17,
        skippedFileCount: 4,
        occurrenceTruncated: true,
        truncated: true,
      }),
    ).toStrictEqual({
      groups: [],
      occurrenceTruncated: true,
      scannedFileCount: 17,
      skippedFileCount: 4,
      truncated: true,
    })
  })

  it('retains at most 1024 distinct color groups and reports omissions', () => {
    const occurrences = Array.from({ length: 1025 }, (_, index) =>
      occurrence(
        'file:///colors.css',
        index * 8,
        index * 8 + 7,
        '#000000',
        `rgb(${Math.floor(index / 256)}, ${index % 256}, 0)`,
      ),
    )

    const result = groupWorkspaceColorOccurrences(occurrences, scanStats)

    expect(result.groups).toHaveLength(1024)
    expect(result.occurrenceTruncated).toBe(true)
    expect(result.groups.flatMap(group => group.occurrences)).toHaveLength(1024)
  })
})
