import {
  commands as vscodeCommands,
  ConfigurationTarget,
  Range,
  Selection,
  Uri,
  window,
  workspace,
} from 'vscode'
import type { TextDocument } from 'vscode'
import type { ContrastDiagnosticCommandPayload } from '../contrast/code-actions'
import { contrastDiagnosticStore } from '../contrast/diagnostics'
import type { ContrastDiagnosticEntry } from '../contrast/diagnostics'
import type { ResolvedContrastColor } from '../contrast/types'
import { commands } from '../meta'

const STALE_WARNING = 'These color diagnostics are no longer current.'

export async function checkContrastDiagnosticPair(
  value: unknown,
): Promise<void> {
  const resolved = await resolveStoredDiagnostic(value)
  if (!resolved) {
    return
  }
  const { document, entry } = resolved
  await vscodeCommands.executeCommand(commands.checkColorContrast, {
    background: toSelection(document, entry.pair.background),
    foreground: toSelection(document, entry.pair.foreground),
  })
}

export async function revealContrastDiagnosticColor(
  value: unknown,
  role: 'background' | 'foreground',
): Promise<void> {
  const resolved = await resolveStoredDiagnostic(value)
  if (!resolved) {
    return
  }
  const color = resolved.entry.pair[role]
  const range = new Range(
    resolved.document.positionAt(color.range.start),
    resolved.document.positionAt(color.range.end),
  )
  const editor = await window.showTextDocument(resolved.document)
  editor.selection = new Selection(range.start, range.end)
  editor.revealRange(range)
}

export async function disableContrastDiagnostics(
  value: unknown,
): Promise<void> {
  if (!(await resolveStoredDiagnostic(value))) {
    return
  }
  await workspace
    .getConfiguration('color-highlight')
    .update('enableContrastDiagnostics', false, ConfigurationTarget.Workspace)
}

async function resolveStoredDiagnostic(
  value: unknown,
): Promise<
  | { readonly document: TextDocument; readonly entry: ContrastDiagnosticEntry }
  | undefined
> {
  const payload = getPayload(value)
  if (!payload) {
    await warnStale()
    return undefined
  }
  try {
    const requestedUri = Uri.parse(payload.uri)
    const document = await workspace.openTextDocument(requestedUri)
    if (
      document.uri.toString() !== payload.uri ||
      document.version !== payload.version
    ) {
      await warnStale()
      return undefined
    }
    const diagnosticRange = new Range(
      payload.range.start.line,
      payload.range.start.character,
      payload.range.end.line,
      payload.range.end.character,
    )
    const entry = contrastDiagnosticStore.get(
      document.uri,
      document.version,
      diagnosticRange,
    )
    if (
      !entry ||
      !matchesOriginalText(document, entry.pair.foreground) ||
      !matchesOriginalText(document, entry.pair.background)
    ) {
      await warnStale()
      return undefined
    }
    return { document, entry }
  } catch {
    await warnStale()
    return undefined
  }
}

function getPayload(
  value: unknown,
): ContrastDiagnosticCommandPayload | undefined {
  if (
    !isRecord(value) ||
    typeof value.uri !== 'string' ||
    !isInteger(value.version)
  ) {
    return undefined
  }
  const range = value.range
  if (!isRecord(range) || !isPosition(range.start) || !isPosition(range.end)) {
    return undefined
  }
  return {
    range: { start: range.start, end: range.end },
    uri: value.uri,
    version: value.version,
  }
}

function isPosition(
  value: unknown,
): value is { readonly character: number; readonly line: number } {
  return (
    isRecord(value) &&
    isInteger(value.character) &&
    value.character >= 0 &&
    isInteger(value.line) &&
    value.line >= 0
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function matchesOriginalText(
  document: TextDocument,
  color: ResolvedContrastColor,
): boolean {
  const text = document.getText()
  if (
    color.range.start < 0 ||
    color.range.end <= color.range.start ||
    color.range.end > text.length
  ) {
    return false
  }
  const range = new Range(
    document.positionAt(color.range.start),
    document.positionAt(color.range.end),
  )
  return document.getText(range) === color.originalText
}

function toSelection(document: TextDocument, color: ResolvedContrastColor) {
  return {
    color: color.color,
    occurrence: {
      color: color.color,
      end: color.range.end,
      sourceText: color.originalText,
      start: color.range.start,
      uri: document.uri.toString(),
    },
  }
}

async function warnStale(): Promise<void> {
  await window.showWarningMessage(STALE_WARNING)
}
