import {
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  Location,
  Range,
} from 'vscode'
import type { TextDocument, Uri } from 'vscode'
import { parseResolvedColor } from '../utils/color/presentation'
import { evaluateColorContrast } from './evaluate'
import type { ResolvedContrastPair } from './types'

export const CONTRAST_DIAGNOSTIC_CODE = 'low-color-contrast'
export const CONTRAST_DIAGNOSTIC_SOURCE = 'Better Color Highlight'

export interface ContrastDiagnosticEntry {
  readonly diagnostic: Diagnostic
  readonly pair: ResolvedContrastPair
}

interface StoredDocumentDiagnostics {
  readonly entries: ReadonlyMap<string, ContrastDiagnosticEntry>
  readonly version: number
}

/** Latest diagnostic entries, indexed without mutating VS Code diagnostics. */
export class ContrastDiagnosticStore {
  readonly #documents = new Map<string, StoredDocumentDiagnostics>()

  public clear(): void {
    this.#documents.clear()
  }

  public delete(uri: Pick<Uri, 'toString'> | string): void {
    this.#documents.delete(uriKey(uri))
  }

  public get(
    uri: Pick<Uri, 'toString'> | string,
    version: number,
    range: Pick<Range, 'end' | 'start'>,
  ): ContrastDiagnosticEntry | undefined {
    const stored = this.#documents.get(uriKey(uri))
    if (!stored || stored.version !== version) {
      return undefined
    }
    return stored.entries.get(rangeKey(range))
  }

  public set(
    uri: Pick<Uri, 'toString'> | string,
    version: number,
    entries: readonly ContrastDiagnosticEntry[],
  ): void {
    this.#documents.set(uriKey(uri), {
      entries: new Map(
        entries.map(entry => [rangeKey(entry.diagnostic.range), entry]),
      ),
      version,
    })
  }
}

export const contrastDiagnosticStore = new ContrastDiagnosticStore()

/** Convert deterministic contrast pairs into extension-owned diagnostics. */
export function createContrastDiagnosticEntries(
  document: Pick<TextDocument, 'positionAt' | 'uri'>,
  pairs: readonly ResolvedContrastPair[],
): ContrastDiagnosticEntry[] {
  const entries: ContrastDiagnosticEntry[] = []

  for (const pair of pairs) {
    const foreground = parseResolvedColor(pair.foreground.color)
    const background = parseResolvedColor(pair.background.color)
    if (!foreground || !background) {
      continue
    }

    const evaluation = evaluateColorContrast(foreground, background)
    if (evaluation.kind !== 'determinate' || evaluation.ratio >= 4.5) {
      continue
    }

    const foregroundRange = toRange(document, pair.foreground.range)
    const backgroundRange = toRange(document, pair.background.range)
    const diagnostic = new Diagnostic(
      foregroundRange,
      `Color contrast ${evaluation.ratio.toFixed(2)}:1 is below WCAG AA 4.5:1 for normal text.`,
      DiagnosticSeverity.Warning,
    )
    diagnostic.source = CONTRAST_DIAGNOSTIC_SOURCE
    diagnostic.code = CONTRAST_DIAGNOSTIC_CODE
    diagnostic.relatedInformation = [
      new DiagnosticRelatedInformation(
        new Location(document.uri, backgroundRange),
        'Background color',
      ),
    ]
    entries.push({ diagnostic, pair })
  }

  return entries
}

function toRange(
  document: Pick<TextDocument, 'positionAt'>,
  range: { readonly end: number; readonly start: number },
): Range {
  return new Range(
    document.positionAt(range.start),
    document.positionAt(range.end),
  )
}

function rangeKey(range: Pick<Range, 'end' | 'start'>): string {
  return `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`
}

function uriKey(uri: Pick<Uri, 'toString'> | string): string {
  return typeof uri === 'string' ? uri : uri.toString()
}
