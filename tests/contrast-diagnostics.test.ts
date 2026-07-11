import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { ResolvedContrastPair } from '../src/contrast/types'

class Position {
  public readonly character: number
  public readonly line: number
  public constructor(line: number, character: number) {
    this.line = line
    this.character = character
  }
}

class Range {
  public readonly end: Position
  public readonly start: Position
  public constructor(start: Position, end: Position) {
    this.start = start
    this.end = end
  }
}

class Diagnostic {
  public code: string | number | undefined
  public relatedInformation: unknown[] | undefined
  public source: string | undefined
  public readonly message: string
  public readonly range: Range
  public readonly severity: number

  public constructor(range: Range, message: string, severity: number) {
    this.range = range
    this.message = message
    this.severity = severity
  }
}

class Location {
  public readonly range: Range
  public readonly uri: unknown
  public constructor(uri: unknown, range: Range) {
    this.uri = uri
    this.range = range
  }
}

class DiagnosticRelatedInformation {
  public readonly location: Location
  public readonly message: string
  public constructor(location: Location, message: string) {
    this.location = location
    this.message = message
  }
}

vi.mock(
  import('vscode'),
  () =>
    ({
      Diagnostic,
      DiagnosticRelatedInformation,
      DiagnosticSeverity: { Warning: 1 },
      Location,
      Range,
    }) as unknown as Partial<typeof Vscode>,
)

const uri = { toString: () => 'file:///colors.css' }
const document = {
  positionAt: (offset: number) => new Position(0, offset),
  uri,
}
const typedDocument = document as unknown as Pick<
  Vscode.TextDocument,
  'positionAt' | 'uri'
>

function pair(foreground: string, background: string): ResolvedContrastPair {
  return {
    background: {
      color: background,
      originalText: 'background-source',
      range: { start: 30, end: 37 },
    },
    contextKey: 'rule:0',
    foreground: {
      color: foreground,
      originalText: 'foreground-source',
      range: { start: 10, end: 17 },
    },
    variantKey: '',
  }
}

describe('createContrastDiagnosticEntries', () => {
  beforeEach(() => vi.resetModules())

  it('creates an extension-owned warning on the foreground with background context', async () => {
    const { createContrastDiagnosticEntries } =
      await import('../src/contrast/diagnostics')

    const [entry] = createContrastDiagnosticEntries(typedDocument, [
      pair('rgb(119, 119, 119)', 'rgb(255, 255, 255)'),
    ])

    expect(entry.pair.foreground.originalText).toBe('foreground-source')
    expect(entry.diagnostic).toMatchObject({
      code: 'low-color-contrast',
      message: 'Color contrast 4.48:1 is below WCAG AA 4.5:1 for normal text.',
      range: { end: { character: 17 }, start: { character: 10 } },
      severity: 1,
      source: 'Better Color Highlight',
    })
    expect(entry.diagnostic.relatedInformation).toMatchObject([
      {
        location: {
          range: { end: { character: 37 }, start: { character: 30 } },
          uri,
        },
        message: 'Background color',
      },
    ])
    expect(Object.keys(entry.diagnostic).sort()).toStrictEqual([
      'code',
      'message',
      'range',
      'relatedInformation',
      'severity',
      'source',
    ])
  })

  it('filters passing and indeterminate pairs while compositing translucent foregrounds', async () => {
    const { createContrastDiagnosticEntries } =
      await import('../src/contrast/diagnostics')

    const entries = createContrastDiagnosticEntries(typedDocument, [
      pair('rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
      pair('rgba(119, 119, 119, 0.5)', 'rgb(255, 255, 255)'),
      pair('rgb(119, 119, 119)', 'rgba(255, 255, 255, 0.5)'),
    ])

    expect(entries).toHaveLength(1)
    expect(entries[0].pair.foreground.color).toBe('rgba(119, 119, 119, 0.5)')
    expect(entries[0].diagnostic.message).toMatch(
      /^Color contrast \d+\.\d{2}:1 is below WCAG AA 4\.5:1 for normal text\.$/u,
    )
  })
})
