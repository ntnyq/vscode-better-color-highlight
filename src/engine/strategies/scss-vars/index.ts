import {
  basenameWorkspacePath,
  dirnameWorkspacePath,
  extnameWorkspacePath,
  isAbsoluteWorkspacePath,
  joinWorkspacePath,
  readWorkspaceFile,
  resolveWorkspacePath,
  statWorkspaceFile,
  workspacePathExists,
} from '../../../shared/workspace/file-system'
import type { WorkspaceReadBudget } from '../../../shared/workspace/read-budget'
import type { ColorDefinitionTarget } from '../../definition/types'
import type {
  CancellationSignal,
  ColorMatch,
  StrategyContext,
} from '../../detection'
import { resolveDirectColor } from '../shared/direct-color'
import { toColorDefinitionTarget } from '../shared/variable-definition'
import type {
  RangedVariableDefinition,
  VariableUsage,
} from '../shared/variable-definition'
import { bindScssVariables } from './scope'

/**
 * Regex for SCSS `@use` statements with optional namespace aliases.
 */
const SCSS_USE_REGEX =
  /@use\s+(?<quote>["'])(?<path>[^"']+)\k<quote>(?:\s+as\s+(?<namespace>[-\w*]+))?\s*;/gu

/**
 * Regex for SCSS `@forward` statements.
 */
const SCSS_FORWARD_REGEX =
  /@forward\s+(?<quote>["'])(?<path>[^"']+)\k<quote>\s*;/gu

/**
 * Regex for legacy SCSS `@import` statements.
 */
const SCSS_IMPORT_REGEX =
  /@import\s+(?<quote>["'])(?<path>[^"']+)\k<quote>\s*;/gu

/**
 * Maximum recursive depth for SCSS dependency resolution.
 */
const MAX_SCSS_RESOLVE_DEPTH = 5

/**
 * Maximum number of SCSS dependency files to read per strategy run.
 */
const MAX_SCSS_RESOLVE_FILES = 32

/**
 * Maximum number of SCSS dependency file contents kept in memory.
 */
const MAX_SCSS_FILE_CONTENT_CACHE_SIZE = 256

/**
 * Maximum SCSS dependency file size read during cross-file resolution.
 */
const MAX_SCSS_FILE_SIZE = 512 * 1024

/**
 * Cached SCSS dependency file content and metadata used for invalidation.
 */
interface ScssFileContentCacheEntry {
  /**
   * Open text-document version when the dependency has unsaved changes.
   */
  readonly documentVersion?: number

  /**
   * Last known file modification timestamp.
   */
  readonly mtimeMs: number

  /**
   * Last known file size in bytes.
   */
  readonly size: number

  /**
   * File text read with UTF-8 encoding.
   */
  readonly text: string
}

/**
 * Process-wide cache for dependency file contents.
 */
const scssFileContentCache = new Map<string, ScssFileContentCacheEntry>()

/**
 * Resolved SCSS module metadata and exported variable definitions.
 */
interface ScssModule {
  /**
   * Absolute file path for the resolved module.
   */
  readonly filePath: string

  /**
   * Namespace used by `@use` references.
   */
  readonly namespace: string

  /**
   * Variable definitions exported by the module.
   */
  readonly varDefs: Map<string, RangedVariableDefinition>
}

/**
 * Mutable state shared while resolving a bounded SCSS dependency graph.
 */
interface ScssResolveState {
  /** Cancellation shared through dependency traversal. */
  readonly signal?: CancellationSignal
  /**
   * Files currently on the recursion stack.
   */
  readonly resolvingFiles: Set<string>

  /**
   * Additional Sass load paths for non-relative module specifiers.
   */
  readonly loadPaths: readonly string[]

  /** Shared bound for unique workspace dependency reads. */
  readonly workspaceReadBudget?: WorkspaceReadBudget

  /**
   * Number of files read during the current resolution run.
   */
  filesRead: number
}

/**
 * Initialize SCSS dependency resolution state from the strategy context.
 */
function createScssResolveState(context?: StrategyContext): ScssResolveState {
  return {
    resolvingFiles: new Set(context?.filePath ? [context.filePath] : []),
    loadPaths: context?.scssLoadPaths ?? [],
    signal: context?.signal,
    workspaceReadBudget: context?.workspaceReadBudget,
    filesRead: 0,
  }
}

/**
 * Infer a Sass module namespace from an import specifier.
 *
 * @param specifier - The raw Sass module specifier
 * @returns The namespace Sass would use by default
 */
function getScssNamespace(specifier: string): string {
  const normalized = specifier.replaceAll(/[/\\]+$/gu, '')
  const fileName = basenameWorkspacePath(normalized)
  const ext = extnameWorkspacePath(fileName)
  const bareName = ext ? fileName.slice(0, -ext.length) : fileName

  return bareName.replace(/^_/u, '')
}

/**
 * Merge source variable definitions into a target without overriding target values.
 *
 * @param target - The target variable definition map
 * @param source - The source variable definition map
 */
function mergeMissingScssVarDefs(
  target: Map<string, RangedVariableDefinition>,
  source: Map<string, RangedVariableDefinition>,
) {
  for (const [name, value] of source) {
    if (!target.has(name)) {
      target.set(name, value)
    }
  }
}

/**
 * Build local filesystem candidates for a Sass module specifier.
 *
 * @param fromFilePath - The file path containing the Sass statement
 * @param specifier - The raw Sass module specifier
 * @returns Candidate file paths in Sass resolution order
 */
function getScssModuleCandidatesForPath(specPath: string): string[] {
  const specBase = basenameWorkspacePath(specPath)
  const ext = extnameWorkspacePath(specBase)
  const withoutExt = ext ? specPath.slice(0, -ext.length) : specPath
  const fileName = basenameWorkspacePath(withoutExt)
  const fileDir = dirnameWorkspacePath(withoutExt)

  return [
    `${withoutExt}.scss`,
    `${withoutExt}.sass`,
    joinWorkspacePath(fileDir, `_${fileName}.scss`),
    joinWorkspacePath(fileDir, `_${fileName}.sass`),
    joinWorkspacePath(withoutExt, 'index.scss'),
    joinWorkspacePath(withoutExt, '_index.scss'),
  ]
}

/**
 * Check whether a Sass module specifier is relative to the current file.
 *
 * @param specifier - The raw Sass module specifier
 * @returns Whether the specifier starts with `.` path syntax
 */
function isRelativeScssSpecifier(specifier: string): boolean {
  return /^\.{1,2}(?:[/\\]|$)/u.test(specifier)
}

/**
 * Collect nearest `node_modules` directories from the current file upward.
 *
 * @param fromFilePath - The file path containing the Sass statement
 * @returns Candidate `node_modules` directories from nearest to farthest
 */
function getNearestNodeModulesPaths(fromFilePath: string): string[] {
  const paths: string[] = []
  let currentDir = dirnameWorkspacePath(fromFilePath)

  while (true) {
    paths.push(joinWorkspacePath(currentDir, 'node_modules'))

    const parentDir = dirnameWorkspacePath(currentDir)
    if (parentDir === currentDir) {
      break
    }

    currentDir = parentDir
  }

  return paths
}

/**
 * Normalize configured Sass load paths relative to the current file.
 *
 * @param fromFilePath - The file path containing the Sass statement
 * @param loadPaths - Raw configured Sass load paths
 * @returns Absolute load paths in declaration order
 */
function normalizeScssLoadPaths(
  fromFilePath: string,
  loadPaths: readonly string[],
): string[] {
  return loadPaths.map(loadPath =>
    isAbsoluteWorkspacePath(loadPath)
      ? loadPath
      : resolveWorkspacePath(fromFilePath, loadPath),
  )
}

/**
 * Check whether this strategy may read SCSS dependencies for the current file.
 *
 * @param context - Optional strategy context
 * @returns Whether cross-file SCSS resolution is enabled and trusted
 */
function canResolveScssAcrossFiles(context?: StrategyContext): boolean {
  return (
    context?.resolveScssVariablesAcrossFiles === true &&
    context.workspaceIsTrusted !== false
  )
}

/**
 * Build local filesystem candidates for a Sass module specifier.
 *
 * @param fromFilePath - The file path containing the Sass statement
 * @param specifier - The raw Sass module specifier
 * @param loadPaths - Additional Sass load paths for bare specifiers
 * @returns Candidate file paths in Sass resolution order
 */
function getScssModuleCandidates(
  fromFilePath: string,
  specifier: string,
  loadPaths: readonly string[],
): string[] {
  const initialPaths = [
    isAbsoluteWorkspacePath(specifier)
      ? specifier
      : joinWorkspacePath(dirnameWorkspacePath(fromFilePath), specifier),
  ]

  if (
    !isAbsoluteWorkspacePath(specifier) &&
    !isRelativeScssSpecifier(specifier)
  ) {
    initialPaths.push(
      ...normalizeScssLoadPaths(fromFilePath, loadPaths).map(loadPath =>
        joinWorkspacePath(loadPath, specifier),
      ),
      ...getNearestNodeModulesPaths(fromFilePath).map(nodeModulesPath =>
        joinWorkspacePath(nodeModulesPath, specifier),
      ),
    )
  }

  return initialPaths.flatMap(getScssModuleCandidatesForPath)
}

/**
 * Check whether a local file path exists.
 *
 * @param filePath - The file path to check
 * @returns Whether the file exists and is accessible
 */
async function readCachedScssFile(
  filePath: string,
  workspaceReadBudget?: WorkspaceReadBudget,
  signal?: CancellationSignal,
): Promise<string | null> {
  if (signal?.isCancellationRequested) {
    return null
  }
  if (workspaceReadBudget && !workspaceReadBudget.tryClaim(filePath)) {
    return null
  }

  try {
    const stats = await statWorkspaceFile(filePath)
    if (signal?.isCancellationRequested) {
      return null
    }
    if (stats.size > MAX_SCSS_FILE_SIZE) {
      return null
    }

    const cached = scssFileContentCache.get(filePath)

    if (
      cached &&
      cached.documentVersion === stats.documentVersion &&
      cached.mtimeMs === stats.mtimeMs &&
      cached.size === stats.size
    ) {
      return cached.text
    }

    if (signal?.isCancellationRequested) {
      return null
    }
    const text = await readWorkspaceFile(filePath)
    if (signal?.isCancellationRequested) {
      return null
    }
    scssFileContentCache.set(filePath, {
      documentVersion: stats.documentVersion,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      text,
    })

    if (scssFileContentCache.size > MAX_SCSS_FILE_CONTENT_CACHE_SIZE) {
      const oldestKey = scssFileContentCache.keys().next().value
      if (oldestKey) {
        scssFileContentCache.delete(oldestKey)
      }
    }

    return text
  } catch {
    return null
  }
}

/**
 * Resolve a local Sass module specifier to a concrete file path.
 *
 * @param fromFilePath - The file path containing the Sass statement
 * @param specifier - The raw Sass module specifier
 * @returns The resolved local file path, or null when unresolved/unsupported
 */
async function resolveScssModulePath(
  fromFilePath: string,
  specifier: string,
  loadPaths: readonly string[],
  workspaceReadBudget?: WorkspaceReadBudget,
  signal?: CancellationSignal,
): Promise<string | null> {
  if (signal?.isCancellationRequested) {
    return null
  }
  if (/^(?:sass:|https?:|npm:)/u.test(specifier)) {
    return null
  }

  for (const candidate of getScssModuleCandidates(
    fromFilePath,
    specifier,
    loadPaths,
  )) {
    if (signal?.isCancellationRequested) {
      return null
    }
    if (workspaceReadBudget && !workspaceReadBudget.tryClaim(candidate)) {
      continue
    }
    const exists = await workspacePathExists(candidate)
    if (signal?.isCancellationRequested) {
      return null
    }
    if (exists) {
      return candidate
    }
  }

  return null
}

/**
 * Load a Sass module and collect variables exported directly or through imports/forwards.
 *
 * @param fromFilePath - The file path containing the Sass statement
 * @param specifier - The raw Sass module specifier
 * @param namespace - The namespace assigned to the module
 * @param state - Shared resolver state for bounds and cycle detection
 * @param depth - Current recursive resolution depth
 * @returns The loaded module, or null when resolution is skipped or fails
 */
async function loadScssModule(
  fromFilePath: string,
  specifier: string,
  namespace: string,
  state: ScssResolveState,
  depth = 0,
): Promise<ScssModule | null> {
  if (
    state.signal?.isCancellationRequested ||
    depth >= MAX_SCSS_RESOLVE_DEPTH ||
    state.filesRead >= MAX_SCSS_RESOLVE_FILES
  ) {
    return null
  }

  const filePath = await resolveScssModulePath(
    fromFilePath,
    specifier,
    state.loadPaths,
    state.workspaceReadBudget,
    state.signal,
  )
  if (state.signal?.isCancellationRequested) {
    return null
  }
  if (!filePath || state.resolvingFiles.has(filePath)) {
    return null
  }

  try {
    state.resolvingFiles.add(filePath)
    state.filesRead += 1

    const text = await readCachedScssFile(
      filePath,
      state.workspaceReadBudget,
      state.signal,
    )
    if (state.signal?.isCancellationRequested) {
      return null
    }
    if (text === null) {
      return null
    }

    const varDefs = new Map<string, RangedVariableDefinition>()
    const importedVarDefs = await collectImportedScssVarDefs(
      text,
      { languageId: 'scss', filePath },
      state,
      depth + 1,
    )
    const forwardedVarDefs = await collectForwardedScssVarDefs(
      filePath,
      text,
      state,
      depth + 1,
    )

    for (const [name, value] of importedVarDefs) {
      if (!varDefs.has(name)) {
        varDefs.set(name, value)
      }
    }

    for (const [name, value] of forwardedVarDefs) {
      if (!varDefs.has(name)) {
        varDefs.set(name, value)
      }
    }

    return {
      filePath,
      namespace,
      varDefs: bindScssVariables(text, filePath, varDefs).definitions,
    }
  } finally {
    state.resolvingFiles.delete(filePath)
  }
}

/**
 * Collect variable definitions forwarded by a Sass module.
 *
 * @param filePath - The module file path containing forward statements
 * @param text - The module source text
 * @param state - Shared resolver state for bounds and cycle detection
 * @param depth - Current recursive resolution depth
 * @returns Map of forwarded variable names to raw values
 */
async function collectForwardedScssVarDefs(
  filePath: string,
  text: string,
  state: ScssResolveState,
  depth: number,
): Promise<Map<string, RangedVariableDefinition>> {
  const varDefs = new Map<string, RangedVariableDefinition>()
  const ambiguousNames = new Set<string>()

  for (const m of text.matchAll(SCSS_FORWARD_REGEX)) {
    if (state.signal?.isCancellationRequested) {
      break
    }
    const specifier = m.groups?.path
    if (!specifier) {
      continue
    }

    const module = await loadScssModule(
      filePath,
      specifier,
      getScssNamespace(specifier),
      state,
      depth,
    )
    if (!module) {
      continue
    }

    for (const [name, value] of module.varDefs) {
      if (ambiguousNames.has(name)) {
        continue
      }
      const existing = varDefs.get(name)
      if (existing && isSameScssVarDefinition(existing, value)) {
        continue
      }
      if (existing) {
        varDefs.delete(name)
        ambiguousNames.add(name)
        continue
      }
      varDefs.set(name, value)
    }
  }

  return varDefs
}

/**
 * Check whether two SCSS definitions identify the same file and source ranges.
 */
function isSameScssVarDefinition(
  left: RangedVariableDefinition,
  right: RangedVariableDefinition,
): boolean {
  return (
    left.filePath === right.filePath &&
    left.nameRange.start === right.nameRange.start &&
    left.nameRange.end === right.nameRange.end &&
    left.valueRange.start === right.valueRange.start &&
    left.valueRange.end === right.valueRange.end
  )
}

/**
 * Collect variable definitions from legacy SCSS imports.
 *
 * @param text - The SCSS source text to scan for imports
 * @param context - Strategy context containing the current file path
 * @param state - Optional shared resolver state for nested imports
 * @param depth - Current recursive resolution depth
 * @returns Map of imported variable names to raw values
 */
async function collectImportedScssVarDefs(
  text: string,
  context: StrategyContext | undefined,
  state: ScssResolveState,
  depth = 0,
): Promise<Map<string, RangedVariableDefinition>> {
  const varDefs = new Map<string, RangedVariableDefinition>()
  if (!context?.filePath) {
    return varDefs
  }

  for (const m of text.matchAll(SCSS_IMPORT_REGEX)) {
    if (state.signal?.isCancellationRequested) {
      break
    }
    const specifier = m.groups?.path
    if (!specifier) {
      continue
    }

    const module = await loadScssModule(
      context.filePath,
      specifier,
      getScssNamespace(specifier),
      state,
      depth,
    )
    if (!module) {
      continue
    }

    for (const [name, value] of module.varDefs) {
      varDefs.set(name, value)
    }
  }

  return varDefs
}

/**
 * Collect variable definitions exposed by `@use ... as *`.
 *
 * @param text - The SCSS source text to scan for `@use` statements
 * @param context - Strategy context containing the current file path
 * @returns Map of star-used variable names to raw values
 */
async function collectUsedStarScssVarDefs(
  text: string,
  context: StrategyContext | undefined,
  state: ScssResolveState,
): Promise<Map<string, RangedVariableDefinition>> {
  const varDefs = new Map<string, RangedVariableDefinition>()
  const ambiguousNames = new Set<string>()
  if (!context?.filePath) {
    return varDefs
  }

  for (const m of text.matchAll(SCSS_USE_REGEX)) {
    if (state.signal?.isCancellationRequested) {
      break
    }
    const specifier = m.groups?.path
    const namespace = m.groups?.namespace
    if (!specifier || namespace !== '*') {
      continue
    }

    const module = await loadScssModule(
      context.filePath,
      specifier,
      getScssNamespace(specifier),
      state,
    )
    if (!module) {
      continue
    }

    for (const [name, value] of module.varDefs) {
      if (ambiguousNames.has(name)) {
        continue
      }
      if (varDefs.has(name)) {
        varDefs.delete(name)
        ambiguousNames.add(name)
        continue
      }
      varDefs.set(name, value)
    }
  }

  return varDefs
}

/**
 * Collect namespaced modules referenced by `@use`.
 *
 * @param text - The SCSS source text to scan for `@use` statements
 * @param context - Strategy context containing the current file path
 * @returns Array of loaded namespaced SCSS modules
 */
async function collectUsedScssModules(
  text: string,
  context: StrategyContext | undefined,
  state: ScssResolveState,
): Promise<ScssModule[]> {
  if (!context?.filePath) {
    return []
  }

  const modules: ScssModule[] = []

  for (const m of text.matchAll(SCSS_USE_REGEX)) {
    if (state.signal?.isCancellationRequested) {
      break
    }
    const specifier = m.groups?.path
    const namespace = m.groups?.namespace ?? getScssNamespace(specifier ?? '')
    if (!specifier || namespace === '*') {
      continue
    }

    const module = await loadScssModule(
      context.filePath,
      specifier,
      namespace,
      state,
    )
    if (module) {
      modules.push(module)
    }
  }

  const namespaceCounts = new Map<string, number>()
  for (const module of modules) {
    namespaceCounts.set(
      module.namespace,
      (namespaceCounts.get(module.namespace) ?? 0) + 1,
    )
  }

  return modules.filter(module => namespaceCounts.get(module.namespace) === 1)
}

/**
 * Load dependency exports, then bind entry references using lexical scope and
 * assignment order. Both highlighting and navigation consume these bindings.
 */
async function bindEntryScssVariables(text: string, context?: StrategyContext) {
  const state = createScssResolveState(context)
  const definitions = new Map<string, RangedVariableDefinition>()
  if (canResolveScssAcrossFiles(context)) {
    mergeMissingScssVarDefs(
      definitions,
      await collectImportedScssVarDefs(text, context, state),
    )
    mergeMissingScssVarDefs(
      definitions,
      await collectUsedStarScssVarDefs(text, context, state),
    )
    for (const module of await collectUsedScssModules(text, context, state)) {
      for (const [name, definition] of module.varDefs) {
        definitions.set(`${module.namespace}.${name}`, definition)
      }
    }
  }
  return bindScssVariables(text, context?.filePath ?? '', definitions)
}

interface ScssVarToken extends VariableUsage {
  readonly namespace?: string
}

/**
 * Find a possibly namespaced SCSS variable reference at a document offset.
 */
function findScssVarTokenAtOffset(
  text: string,
  offset: number,
): ScssVarToken | null {
  const regex = /(?:(?<namespace>[-\w]+)\.)?\$(?<name>[-\w]+)/gu
  for (const match of text.matchAll(regex)) {
    const name = match.groups?.name
    if (!name) {
      continue
    }
    const start = match.index ?? 0
    const end = start + match[0].length
    if (offset < start || offset >= end) {
      continue
    }
    if (/[-\w$.]/u.test(text[start - 1] ?? '')) {
      continue
    }
    if (/^\s*:/u.test(text.slice(end))) {
      continue
    }
    return {
      name,
      namespace: match.groups?.namespace,
      originRange: { start, end },
    }
  }
  return null
}

/**
 * Resolve the SCSS variable reference at an offset to its final color
 * declaration.
 */
export async function resolveScssVarDefinition(
  text: string,
  offset: number,
  context?: StrategyContext,
): Promise<ColorDefinitionTarget | null> {
  const usage = findScssVarTokenAtOffset(text, offset)
  if (!usage) {
    return null
  }

  const { usages } = await bindEntryScssVariables(text, context)
  const bound = usages.find(
    item => item.originRange.start === usage.originRange.start,
  )
  if (!bound || context?.signal?.isCancellationRequested) {
    return null
  }
  const color = await resolveDirectColor(bound.definition.value, context)
  return color && !context?.signal?.isCancellationRequested
    ? toColorDefinitionTarget(bound, bound.definition)
    : null
}

/**
 * Detect SCSS variable colors using the binding visible at each reference.
 */
export async function findScssVars(
  text: string,
  context?: StrategyContext,
): Promise<ColorMatch[]> {
  const { usages } = await bindEntryScssVariables(text, context)
  const colors = new Map<RangedVariableDefinition, string | null>()
  const matches: ColorMatch[] = []
  for (const usage of usages) {
    if (context?.signal?.isCancellationRequested) {
      return []
    }
    const { definition, originRange } = usage
    if (!colors.has(definition)) {
      colors.set(
        definition,
        await resolveDirectColor(definition.value, context),
      )
    }
    const color = colors.get(definition)
    if (color) {
      matches.push({ start: originRange.start, end: originRange.end, color })
    }
  }
  return context?.signal?.isCancellationRequested ? [] : matches
}
