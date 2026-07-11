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
  public source: string | undefined
  public readonly range: Range
  public constructor(range: Range) {
    this.range = range
  }
}
class CodeAction {
  public command: unknown
  public diagnostics: readonly Diagnostic[] | undefined
  public readonly kind: string
  public readonly title: string
  public constructor(title: string, kind: string) {
    this.title = title
    this.kind = kind
  }
}

interface SyncCodeActionProvider {
  readonly provideCodeActions: (
    document: Vscode.TextDocument,
    range: Vscode.Range,
    context: Vscode.CodeActionContext,
    token: Vscode.CancellationToken,
  ) => Vscode.CodeAction[]
}

vi.mock(
  import('vscode'),
  () =>
    ({
      CodeAction,
      CodeActionKind: { QuickFix: 'quickfix' },
      Diagnostic,
      Position,
      Range,
    }) as unknown as Partial<typeof Vscode>,
)

const uri = { toString: () => 'file:///colors.css' }
const range = new Range(new Position(1, 2), new Position(1, 9))
const pair: ResolvedContrastPair = {
  background: {
    color: 'rgb(255, 255, 255)',
    originalText: '#fff',
    range: { start: 20, end: 24 },
  },
  contextKey: 'rule:0',
  foreground: {
    color: 'rgb(119, 119, 119)',
    originalText: '#777',
    range: { start: 10, end: 14 },
  },
  variantKey: '',
}

describe('contrast diagnostic code actions', () => {
  beforeEach(() => vi.resetModules())

  it('offers four quick fixes backed by an exact versioned store lookup', async () => {
    const {
      CONTRAST_DIAGNOSTIC_CODE,
      CONTRAST_DIAGNOSTIC_SOURCE,
      ContrastDiagnosticStore,
    } = await import('../src/contrast/diagnostics')
    const { createContrastCodeActionProvider } =
      await import('../src/contrast/code-actions')
    const diagnostic = new Diagnostic(range)
    diagnostic.code = CONTRAST_DIAGNOSTIC_CODE
    diagnostic.source = CONTRAST_DIAGNOSTIC_SOURCE
    const store = new ContrastDiagnosticStore()
    store.set(uri, 4, [
      { diagnostic: diagnostic as unknown as Vscode.Diagnostic, pair },
    ])

    const provider = createContrastCodeActionProvider(
      store,
    ) as unknown as SyncCodeActionProvider
    const actions = provider.provideCodeActions(
      { uri, version: 4 } as Vscode.TextDocument,
      range as unknown as Vscode.Range,
      { diagnostics: [diagnostic] } as unknown as Vscode.CodeActionContext,
      { isCancellationRequested: false } as Vscode.CancellationToken,
    )

    expect(actions).toHaveLength(4)
    expect(actions.map(action => action.title)).toStrictEqual([
      'Check these colors',
      'Go to foreground color',
      'Go to background color',
      'Disable contrast diagnostics',
    ])
    expect(actions.every(action => String(action.kind) === 'quickfix')).toBe(
      true,
    )
    expect(actions[0].command).toMatchObject({
      arguments: [
        {
          range: {
            end: { character: 9, line: 1 },
            start: { character: 2, line: 1 },
          },
          uri: 'file:///colors.css',
          version: 4,
        },
      ],
    })
  })

  it('isolates unrelated, stale, inexact, and cancelled diagnostics', async () => {
    const {
      CONTRAST_DIAGNOSTIC_CODE,
      CONTRAST_DIAGNOSTIC_SOURCE,
      ContrastDiagnosticStore,
    } = await import('../src/contrast/diagnostics')
    const { createContrastCodeActionProvider } =
      await import('../src/contrast/code-actions')
    const diagnostic = new Diagnostic(range)
    diagnostic.code = CONTRAST_DIAGNOSTIC_CODE
    diagnostic.source = CONTRAST_DIAGNOSTIC_SOURCE
    const store = new ContrastDiagnosticStore()
    store.set(uri, 4, [
      { diagnostic: diagnostic as unknown as Vscode.Diagnostic, pair },
    ])
    const provider = createContrastCodeActionProvider(
      store,
    ) as unknown as SyncCodeActionProvider
    const context = {
      diagnostics: [diagnostic],
    } as unknown as Vscode.CodeActionContext
    const token = { isCancellationRequested: false } as Vscode.CancellationToken

    expect(
      provider.provideCodeActions(
        { uri, version: 5 } as Vscode.TextDocument,
        range as unknown as Vscode.Range,
        context,
        token,
      ),
    ).toStrictEqual([])
    const inexactRange = new Range(new Position(1, 3), new Position(1, 9))
    const inexactDiagnostic = new Diagnostic(inexactRange)
    inexactDiagnostic.code = CONTRAST_DIAGNOSTIC_CODE
    inexactDiagnostic.source = CONTRAST_DIAGNOSTIC_SOURCE
    expect(
      provider.provideCodeActions(
        { uri, version: 4 } as Vscode.TextDocument,
        inexactRange as unknown as Vscode.Range,
        {
          diagnostics: [inexactDiagnostic],
        } as unknown as Vscode.CodeActionContext,
        token,
      ),
    ).toStrictEqual([])
    diagnostic.source = 'TypeScript'
    expect(
      provider.provideCodeActions(
        { uri, version: 4 } as Vscode.TextDocument,
        range as unknown as Vscode.Range,
        context,
        token,
      ),
    ).toStrictEqual([])
    diagnostic.source = CONTRAST_DIAGNOSTIC_SOURCE
    expect(
      provider.provideCodeActions(
        { uri, version: 4 } as Vscode.TextDocument,
        range as unknown as Vscode.Range,
        context,
        { isCancellationRequested: true } as Vscode.CancellationToken,
      ),
    ).toStrictEqual([])
  })
})
