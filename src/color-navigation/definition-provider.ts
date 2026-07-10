import { Range, Uri, workspace } from 'vscode'
import type {
  CancellationToken,
  LocationLink,
  Position,
  TextDocument,
} from 'vscode'
import { config } from '../config'
import { shouldProcessLanguage } from '../core/strategy-registry'
import type { ColorSourceRange, StrategyContext } from '../types'
import { logger } from '../utils/logger'
import { resolveColorDefinition } from './resolve-color-definition'

/** Provide a precise VS Code definition link for a color reference. */
export async function provideColorDefinition(
  document: TextDocument,
  position: Position,
  cancellationToken: CancellationToken,
): Promise<LocationLink[] | undefined> {
  if (
    !config.enable ||
    !config.enableColorNavigation ||
    cancellationToken.isCancellationRequested ||
    !shouldProcessLanguage(document.languageId, config.languages)
  ) {
    return
  }

  const text = document.getText()
  if (config.maxFileSize > 0 && text.length > config.maxFileSize) {
    return
  }

  try {
    const target = await resolveColorDefinition(
      text,
      document.offsetAt(position),
      createStrategyContext(document),
    )
    if (!target || cancellationToken.isCancellationRequested) {
      return
    }

    const targetUri = toUri(target.targetFilePath)
    const targetDocument =
      targetUri.toString() === document.uri.toString()
        ? document
        : await workspace.openTextDocument(targetUri)
    if (cancellationToken.isCancellationRequested) {
      return
    }

    return [
      {
        originSelectionRange: toRange(document, target.originRange),
        targetUri,
        targetRange: toRange(targetDocument, target.targetRange),
        targetSelectionRange: toRange(
          targetDocument,
          target.targetSelectionRange,
        ),
      },
    ]
  } catch (error) {
    logger.error(`Color definition provider failed: ${error}`)
  }
}

function createStrategyContext(document: TextDocument): StrategyContext {
  return {
    languageId: document.languageId,
    filePath: document.uri.toString(),
    namedColorMatchMode: config.namedColorMatchMode,
    resolveScssVariablesAcrossFiles: config.resolveScssVariablesAcrossFiles,
    scssLoadPaths: config.scssLoadPaths,
    resolveCssVariablesAcrossFiles: config.resolveCssVariablesAcrossFiles,
    cssVariablePaths: config.cssVariablePaths,
    cssVariableTrustedSelectors: config.cssVariableTrustedSelectors,
    designTokenJsonMode: config.designTokenJsonMode,
    resolveDesignTokensAcrossFiles: config.resolveDesignTokensAcrossFiles,
    useARGB: config.useARGB,
    workspaceIsTrusted: workspace.isTrusted,
  }
}

function toRange(document: TextDocument, range: ColorSourceRange): Range {
  return new Range(
    document.positionAt(range.start),
    document.positionAt(range.end),
  )
}

function toUri(value: string): Uri {
  return !/^[a-z]:[/\\]/iu.test(value) && /^[a-z][\d+.a-z-]*:/iu.test(value)
    ? Uri.parse(value)
    : Uri.file(value)
}
