import { CodeAction, CodeActionKind } from 'vscode'
import type {
  CancellationToken,
  CodeActionContext,
  CodeActionProvider,
  Diagnostic,
  Range,
  TextDocument,
} from 'vscode'
import { INTERNAL_COMMANDS } from '../constants/commands'
import {
  CONTRAST_DIAGNOSTIC_CODE,
  CONTRAST_DIAGNOSTIC_SOURCE,
} from './diagnostics'
import type { ContrastDiagnosticStore } from './diagnostics'

export interface ContrastDiagnosticCommandPayload {
  readonly range: {
    readonly end: { readonly character: number; readonly line: number }
    readonly start: { readonly character: number; readonly line: number }
  }
  readonly uri: string
  readonly version: number
}

/** Create Quick Fixes for exact, current diagnostics owned by this extension. */
export function createContrastCodeActionProvider(
  store: ContrastDiagnosticStore,
): CodeActionProvider {
  return {
    provideCodeActions(
      document: TextDocument,
      _range: Range,
      context: CodeActionContext,
      token: CancellationToken,
    ): CodeAction[] {
      if (token.isCancellationRequested) {
        return []
      }

      const actions: CodeAction[] = []
      for (const diagnostic of context.diagnostics) {
        if (
          token.isCancellationRequested ||
          !isOwnedDiagnostic(diagnostic) ||
          !store.get(document.uri, document.version, diagnostic.range)
        ) {
          continue
        }

        const payload = toPayload(document, diagnostic.range)
        actions.push(
          createAction(
            'Check these colors',
            INTERNAL_COMMANDS.checkContrastPair,
            diagnostic,
            payload,
          ),
          createAction(
            'Go to foreground color',
            INTERNAL_COMMANDS.revealContrastForeground,
            diagnostic,
            payload,
          ),
          createAction(
            'Go to background color',
            INTERNAL_COMMANDS.revealContrastBackground,
            diagnostic,
            payload,
          ),
          createAction(
            'Disable contrast diagnostics',
            INTERNAL_COMMANDS.disableContrastDiagnostics,
            diagnostic,
            payload,
          ),
        )
      }
      return actions
    },
  }
}

function createAction(
  title: string,
  command: string,
  diagnostic: Diagnostic,
  payload: ContrastDiagnosticCommandPayload,
): CodeAction {
  const action = new CodeAction(title, CodeActionKind.QuickFix)
  action.diagnostics = [diagnostic]
  action.command = { arguments: [payload], command, title }
  return action
}

function isOwnedDiagnostic(diagnostic: Diagnostic): boolean {
  return (
    diagnostic.source === CONTRAST_DIAGNOSTIC_SOURCE &&
    diagnostic.code === CONTRAST_DIAGNOSTIC_CODE
  )
}

function toPayload(
  document: TextDocument,
  range: Range,
): ContrastDiagnosticCommandPayload {
  return {
    range: {
      end: { character: range.end.character, line: range.end.line },
      start: { character: range.start.character, line: range.start.line },
    },
    uri: document.uri.toString(),
    version: document.version,
  }
}
