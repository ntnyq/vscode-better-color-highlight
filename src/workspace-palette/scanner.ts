import { workspace } from 'vscode'
import type { CancellationToken, Uri } from 'vscode'
import { runColorDetectors } from '../core/color-detection'
import { getStrategies, shouldProcessLanguage } from '../core/strategy-registry'
import type { NestedScopedConfigs } from '../meta'
import type { ColorMatch, StrategyContext } from '../types'
import { getColorPresentations } from '../utils/color/presentation'
import { logger } from '../utils/logger'
import { createWorkspaceReadBudget } from '../utils/workspace-read-budget'
import { groupWorkspaceColorOccurrences } from './model'
import type { WorkspaceColorOccurrence, WorkspacePaletteResult } from './types'

const MAX_CANDIDATE_COUNT = 256
const FIND_FILES_RESULT_LIMIT = MAX_CANDIDATE_COUNT + 1
const MAX_SOURCE_BYTE_LENGTH = 512 * 1024
const BINARY_PROBE_LENGTH = 8 * 1024
const MAX_DEPENDENCY_READ_COUNT = 512
const MAX_OCCURRENCES_PER_FILE = 2000
const MAX_RETAINED_OCCURRENCE_COUNT = 20_000
const MAX_COLOR_GROUP_COUNT = 1024

export interface WorkspacePaletteScanConfig {
  readonly cssVariablePaths: readonly string[]
  readonly cssVariableTrustedSelectors: readonly string[]
  readonly designTokenJsonMode: NestedScopedConfigs['designTokenJsonMode']
  readonly languages: readonly string[]
  readonly matchHslWithNoFunction: boolean
  readonly matchRgbWithNoFunction: boolean
  readonly matchWords: boolean
  readonly maxFileSize: number
  readonly namedColorMatchMode: NestedScopedConfigs['namedColorMatchMode']
  readonly resolveCssVariablesAcrossFiles: boolean
  readonly resolveDesignTokensAcrossFiles: boolean
  readonly resolveScssVariablesAcrossFiles: boolean
  readonly rgbWithNoFunctionLanguages: readonly string[]
  readonly hslWithNoFunctionLanguages: readonly string[]
  readonly scssLoadPaths: readonly string[]
  readonly tailwindColorMode: NestedScopedConfigs['tailwindColorMode']
  readonly tailwindStylesheetPaths: readonly string[]
  readonly useARGB: boolean
  readonly workspacePaletteExclude: string
  readonly workspacePaletteInclude: string
}

export interface WorkspacePaletteProgress {
  readonly occurrenceTruncated: boolean
  readonly processedFileCount: number
  readonly scannedFileCount: number
  readonly skippedFileCount: number
  readonly totalFileCount: number
  readonly truncated: boolean
}

interface OccurrenceRetentionState {
  occurrenceTruncated: boolean
  readonly occurrences: WorkspaceColorOccurrence[]
  readonly retainedColors: Set<string>
}

export interface ScanWorkspacePaletteOptions {
  readonly cancellationToken: CancellationToken
  readonly config: WorkspacePaletteScanConfig
  readonly onProgress?: (progress: WorkspacePaletteProgress) => void
  readonly workspaceIsTrusted: boolean
}

export class WorkspacePaletteScanConfigurationError extends Error {
  public readonly name = 'WorkspacePaletteScanConfigurationError'

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options)
  }
}

/** Scan a deterministic, bounded set of workspace documents for colors. */
export async function scanWorkspacePalette({
  cancellationToken,
  config,
  onProgress,
  workspaceIsTrusted,
}: ScanWorkspacePaletteOptions): Promise<WorkspacePaletteResult | null> {
  config = createWorkspacePaletteScanConfig(config)
  const include = validateGlob(config.workspacePaletteInclude, 'include')
  const exclude = validateGlob(config.workspacePaletteExclude, 'exclude')

  const uris = await findWorkspaceUris(include, exclude, cancellationToken)
  if (!uris) {
    return null
  }

  const truncated = uris.length > MAX_CANDIDATE_COUNT
  const candidates = uris
    .toSorted((left, right) =>
      compareCodeUnits(left.toString(), right.toString()),
    )
    .slice(0, MAX_CANDIDATE_COUNT)
  const retention: OccurrenceRetentionState = {
    occurrenceTruncated: false,
    occurrences: [],
    retainedColors: new Set(),
  }
  const workspaceReadBudget = createWorkspaceReadBudget(
    MAX_DEPENDENCY_READ_COUNT,
  )
  let scannedFileCount = 0
  let skippedFileCount = 0

  const reportProgress = (): void => {
    onProgress?.({
      occurrenceTruncated: retention.occurrenceTruncated,
      processedFileCount: scannedFileCount + skippedFileCount,
      scannedFileCount,
      skippedFileCount,
      totalFileCount: candidates.length,
      truncated,
    })
  }

  for (const uri of candidates) {
    if (retention.occurrences.length >= MAX_RETAINED_OCCURRENCE_COUNT) {
      retention.occurrenceTruncated = true
      reportProgress()
      break
    }
    if (cancellationToken.isCancellationRequested) {
      return null
    }

    let stat
    try {
      stat = await workspace.fs.stat(uri)
    } catch {
      if (cancellationToken.isCancellationRequested) {
        return null
      }
      skippedFileCount++
      reportProgress()
      continue
    }

    if (cancellationToken.isCancellationRequested) {
      return null
    }
    if (stat.size > MAX_SOURCE_BYTE_LENGTH) {
      skippedFileCount++
      reportProgress()
      continue
    }

    if (cancellationToken.isCancellationRequested) {
      return null
    }

    let document
    try {
      document = await workspace.openTextDocument(uri)
    } catch {
      if (cancellationToken.isCancellationRequested) {
        return null
      }
      skippedFileCount++
      reportProgress()
      continue
    }

    if (cancellationToken.isCancellationRequested) {
      return null
    }

    const text = document.getText()
    if (shouldSkipDocument(text, document.languageId, config)) {
      skippedFileCount++
      reportProgress()
      continue
    }

    const context: StrategyContext = {
      signal: cancellationToken,
      languageId: document.languageId,
      filePath: document.uri.toString(),
      namedColorMatchMode: config.namedColorMatchMode,
      tailwindColorMode: config.tailwindColorMode,
      tailwindStylesheetPaths: config.tailwindStylesheetPaths,
      resolveScssVariablesAcrossFiles: config.resolveScssVariablesAcrossFiles,
      scssLoadPaths: config.scssLoadPaths,
      resolveCssVariablesAcrossFiles: config.resolveCssVariablesAcrossFiles,
      cssVariablePaths: config.cssVariablePaths,
      cssVariableTrustedSelectors: config.cssVariableTrustedSelectors,
      designTokenJsonMode: config.designTokenJsonMode,
      resolveDesignTokensAcrossFiles: config.resolveDesignTokensAcrossFiles,
      useARGB: config.useARGB,
      workspaceIsTrusted,
      workspaceReadBudget,
    }

    if (cancellationToken.isCancellationRequested) {
      return null
    }

    const matches = await runColorDetectors({
      context,
      detectors: getStrategies(
        document.languageId,
        config,
        document.uri.toString(),
      ),
      onDetectorError: message => logger.error(message),
      text,
    })

    if (cancellationToken.isCancellationRequested) {
      return null
    }

    retainFileOccurrences(matches, text, document.uri.toString(), retention)
    scannedFileCount++
    reportProgress()
  }

  return groupWorkspaceColorOccurrences(retention.occurrences, {
    occurrenceTruncated: retention.occurrenceTruncated,
    scannedFileCount,
    skippedFileCount,
    truncated,
  })
}

function retainFileOccurrences(
  matches: readonly ColorMatch[],
  text: string,
  uri: string,
  state: OccurrenceRetentionState,
): void {
  const seen = new Set<string>()
  let retainedCount = 0
  for (const match of matches) {
    if (!isValidMatchRange(match.start, match.end, text.length)) {
      continue
    }
    const key = `${match.start}:${match.end}:${match.color}`
    if (seen.has(key) || !getColorPresentations(match.color)) {
      continue
    }
    seen.add(key)
    if (retainedCount >= MAX_OCCURRENCES_PER_FILE) {
      state.occurrenceTruncated = true
      continue
    }
    if (
      !state.retainedColors.has(match.color) &&
      state.retainedColors.size >= MAX_COLOR_GROUP_COUNT
    ) {
      state.occurrenceTruncated = true
      continue
    }
    if (state.occurrences.length >= MAX_RETAINED_OCCURRENCE_COUNT) {
      state.occurrenceTruncated = true
      break
    }
    state.retainedColors.add(match.color)
    state.occurrences.push({
      color: match.color,
      end: match.end,
      sourceText: text.slice(match.start, match.end),
      start: match.start,
      uri,
    })
    retainedCount++
  }
}

/** Clone every scan-relevant setting into a plain immutable-by-ownership value. */
export function createWorkspacePaletteScanConfig(
  config: WorkspacePaletteScanConfig,
): WorkspacePaletteScanConfig {
  return {
    ...config,
    cssVariablePaths: [...config.cssVariablePaths],
    cssVariableTrustedSelectors: [...config.cssVariableTrustedSelectors],
    hslWithNoFunctionLanguages: [...config.hslWithNoFunctionLanguages],
    languages: [...config.languages],
    rgbWithNoFunctionLanguages: [...config.rgbWithNoFunctionLanguages],
    scssLoadPaths: [...config.scssLoadPaths],
    tailwindStylesheetPaths: [...config.tailwindStylesheetPaths],
  }
}

async function findWorkspaceUris(
  include: string,
  exclude: string,
  cancellationToken: CancellationToken,
): Promise<readonly Uri[] | null> {
  if (cancellationToken.isCancellationRequested) {
    return null
  }

  try {
    const uris = await workspace.findFiles(
      include,
      exclude,
      FIND_FILES_RESULT_LIMIT,
    )
    return cancellationToken.isCancellationRequested ? null : uris
  } catch (error) {
    if (cancellationToken.isCancellationRequested) {
      return null
    }
    throw new WorkspacePaletteScanConfigurationError(
      'The workspace palette include or exclude glob is invalid.',
      { cause: error },
    )
  }
}

function shouldSkipDocument(
  text: string,
  languageId: string,
  config: WorkspacePaletteScanConfig,
): boolean {
  return (
    new TextEncoder().encode(text).byteLength > MAX_SOURCE_BYTE_LENGTH ||
    (config.maxFileSize > 0 && text.length > config.maxFileSize) ||
    text.slice(0, BINARY_PROBE_LENGTH).includes('\0') ||
    !shouldProcessLanguage(languageId, config.languages)
  )
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}

function validateGlob(value: string, name: 'exclude' | 'include'): string {
  if (value.trim().length === 0) {
    throw new WorkspacePaletteScanConfigurationError(
      `The workspace palette ${name} glob must not be empty.`,
    )
  }
  return value
}

function isValidMatchRange(
  start: number,
  end: number,
  length: number,
): boolean {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= length
  )
}
