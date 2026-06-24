import type { ColorMatch, ColorDetector, StrategyContext } from '../types'
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
} from '../utils/workspace-file-system'
import { findColorFunctions } from './color-functions'
import { findHexRGBA } from './hex'
import { findHwb } from './hwb'
import { findNamedColors } from './named-colors'

/**
 * Regex for SCSS variable definitions anywhere in a stylesheet:
 *   $my-color: #ff0000;
 */
const SCSS_VAR_DEF_REGEX = /\$(?<name>[-\w]+)\s*:\s*(?<value>[^;]+?)\s*;/gu

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
 * Resolve a raw SCSS value to a color using the base color strategies.
 *
 * @param value - The raw SCSS value to resolve
 * @returns The resolved rgb() color string, or null if no color is found
 */
async function resolveDirectColor(value: string): Promise<string | null> {
  const strategies: ColorDetector[] = [
    findHexRGBA,
    findColorFunctions,
    findHwb,
    findNamedColors,
  ]

  const results = await Promise.all(strategies.map(fn => fn(value)))
  const allMatches = results.flat()
  const exactMatch = allMatches.find(
    match => match.start === 0 && match.end === value.length,
  )
  return exactMatch?.color ?? null
}

/**
 * Resolve SCSS variable values to colors, following nested variable references.
 *
 * @param value - The raw SCSS variable value
 * @param varDefs - All visible SCSS variable definitions
 * @param seen - Variables already visited to avoid cycles
 * @returns The resolved rgb() color string, or null if no color is found
 */
async function resolveVarValue(
  value: string,
  varDefs: Map<string, string>,
  seen = new Set<string>(),
): Promise<string | null> {
  const normalized = value.replaceAll(/!important\b/gu, '').trim()

  const directColor = await resolveDirectColor(normalized)
  if (directColor) {
    return directColor
  }

  const refName = getExactScssVarAlias(normalized)
  if (refName) {
    if (seen.has(refName)) {
      return null
    }

    const refValue = varDefs.get(refName)
    if (!refValue) {
      return null
    }

    const resolved = await resolveVarValue(
      refValue,
      varDefs,
      new Set([...seen, refName]),
    )
    if (resolved) {
      return resolved
    }
  }

  return null
}

/**
 * Parse a value that is exactly one SCSS variable alias.
 *
 * @param value - Normalized SCSS value
 * @returns Variable name without `$`, or null when value is composite
 */
function getExactScssVarAlias(value: string): string | null {
  const match = value.match(/^\$(?<name>[-\w]+)$/u)
  return match?.groups?.name ?? null
}

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
  readonly varDefs: Map<string, string>
}

/**
 * Mutable state shared while resolving a bounded SCSS dependency graph.
 */
interface ScssResolveState {
  /**
   * Files currently on the recursion stack.
   */
  readonly resolvingFiles: Set<string>

  /**
   * Additional Sass load paths for non-relative module specifiers.
   */
  readonly loadPaths: readonly string[]

  /**
   * Number of files read during the current resolution run.
   */
  filesRead: number
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
 * Collect SCSS variable definitions from text.
 *
 * @param text - The SCSS source text to scan
 * @returns Map of variable names to raw values
 */
function collectScssVarDefs(text: string): Map<string, string> {
  const varDefs = new Map<string, string>()

  for (const m of text.matchAll(SCSS_VAR_DEF_REGEX)) {
    const name = m.groups?.name
    const value = m.groups?.value?.trim()
    if (!name || !value) continue

    varDefs.set(name, value)
  }

  return varDefs
}

/**
 * Merge source variable definitions into a target without overriding target values.
 *
 * @param target - The target variable definition map
 * @param source - The source variable definition map
 */
function mergeMissingScssVarDefs(
  target: Map<string, string>,
  source: Map<string, string>,
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
async function readCachedScssFile(filePath: string): Promise<string | null> {
  try {
    const stats = await statWorkspaceFile(filePath)
    if (stats.size > MAX_SCSS_FILE_SIZE) {
      return null
    }

    const cached = scssFileContentCache.get(filePath)

    if (
      cached &&
      cached.mtimeMs === stats.mtimeMs &&
      cached.size === stats.size
    ) {
      return cached.text
    }

    const text = await readWorkspaceFile(filePath)
    scssFileContentCache.set(filePath, {
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
): Promise<string | null> {
  if (/^(?:sass:|https?:|npm:)/u.test(specifier)) {
    return null
  }

  for (const candidate of getScssModuleCandidates(
    fromFilePath,
    specifier,
    loadPaths,
  )) {
    if (await workspacePathExists(candidate)) {
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
    depth >= MAX_SCSS_RESOLVE_DEPTH ||
    state.filesRead >= MAX_SCSS_RESOLVE_FILES
  ) {
    return null
  }

  const filePath = await resolveScssModulePath(
    fromFilePath,
    specifier,
    state.loadPaths,
  )
  if (!filePath || state.resolvingFiles.has(filePath)) {
    return null
  }

  try {
    state.resolvingFiles.add(filePath)
    state.filesRead += 1

    const text = await readCachedScssFile(filePath)
    if (text === null) {
      return null
    }

    const varDefs = collectScssVarDefs(text)
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
      varDefs,
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
): Promise<Map<string, string>> {
  const varDefs = new Map<string, string>()

  for (const m of text.matchAll(SCSS_FORWARD_REGEX)) {
    const specifier = m.groups?.path
    if (!specifier) continue

    const module = await loadScssModule(
      filePath,
      specifier,
      getScssNamespace(specifier),
      state,
      depth,
    )
    if (!module) continue

    for (const [name, value] of module.varDefs) {
      varDefs.set(name, value)
    }
  }

  return varDefs
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
  state?: ScssResolveState,
  depth = 0,
): Promise<Map<string, string>> {
  const varDefs = new Map<string, string>()
  if (!context?.filePath) {
    return varDefs
  }

  const resolveState = state ?? {
    resolvingFiles: new Set([context.filePath]),
    loadPaths: context.scssLoadPaths ?? [],
    filesRead: 0,
  }

  for (const m of text.matchAll(SCSS_IMPORT_REGEX)) {
    const specifier = m.groups?.path
    if (!specifier) continue

    const module = await loadScssModule(
      context.filePath,
      specifier,
      getScssNamespace(specifier),
      resolveState,
      depth,
    )
    if (!module) continue

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
): Promise<Map<string, string>> {
  const varDefs = new Map<string, string>()
  if (!context?.filePath) {
    return varDefs
  }

  const state: ScssResolveState = {
    resolvingFiles: new Set([context.filePath]),
    loadPaths: context.scssLoadPaths ?? [],
    filesRead: 0,
  }

  for (const m of text.matchAll(SCSS_USE_REGEX)) {
    const specifier = m.groups?.path
    const namespace = m.groups?.namespace
    if (!specifier || namespace !== '*') continue

    const module = await loadScssModule(
      context.filePath,
      specifier,
      getScssNamespace(specifier),
      state,
    )
    if (!module) continue

    for (const [name, value] of module.varDefs) {
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
  context?: StrategyContext,
): Promise<ScssModule[]> {
  if (!context?.filePath) {
    return []
  }

  const state: ScssResolveState = {
    resolvingFiles: new Set([context.filePath]),
    loadPaths: context.scssLoadPaths ?? [],
    filesRead: 0,
  }
  const modules: ScssModule[] = []

  for (const m of text.matchAll(SCSS_USE_REGEX)) {
    const specifier = m.groups?.path
    const namespace = m.groups?.namespace ?? getScssNamespace(specifier ?? '')
    if (!specifier || namespace === '*') continue

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

  return modules
}

/**
 * Collect all variable definitions visible in the entry SCSS file.
 *
 * @param text - The entry SCSS source text
 * @param context - Optional strategy context controlling cross-file resolution
 * @returns Map of visible variable names to raw values
 */
async function collectEntryScssVarDefs(
  text: string,
  context?: StrategyContext,
): Promise<Map<string, string>> {
  const varDefs = collectScssVarDefs(text)
  if (context?.resolveScssVariablesAcrossFiles !== true) {
    return varDefs
  }

  mergeMissingScssVarDefs(
    varDefs,
    await collectImportedScssVarDefs(text, context),
  )
  mergeMissingScssVarDefs(
    varDefs,
    await collectUsedStarScssVarDefs(text, context),
  )

  return varDefs
}

/**
 * Detect SCSS variable colors.
 * Resolves variables from the current document and a limited dependency graph
 * for @use, @forward, and @import.
 *
 * Phase 1: Find all $var definitions and resolve their values.
 * Phase 2: Find all $var usages and map them to resolved colors.
 *
 * @param text - The document text to scan for SCSS variable colors
 * @param context - Optional strategy context with file path and resolver settings
 * @returns Array of color matches found in the text
 */
export async function findScssVars(
  text: string,
  context?: StrategyContext,
): Promise<ColorMatch[]> {
  // Phase 1: Find variable definitions
  const varDefs = await collectEntryScssVarDefs(text, context)
  const varColors = new Map<string, string>() // name (without $) -> resolved color
  const shouldResolveAcrossFiles =
    context?.resolveScssVariablesAcrossFiles === true
  const modules = shouldResolveAcrossFiles
    ? await collectUsedScssModules(text, context)
    : []

  // Resolve variable values to colors
  await Promise.all(
    [...varDefs.entries()].map(async ([name, value]) => {
      const color = await resolveVarValue(value, varDefs)
      if (color) {
        varColors.set(name, color)
      }
    }),
  )

  const moduleColors = await resolveScssModuleColors(modules)

  if (varColors.size === 0 && moduleColors.size === 0) return []

  // Phase 2: Find $var usages
  const matches: ColorMatch[] = []
  const matchableNames = [...varColors.keys()]
  const usageRegex = buildScssVarUsageRegex(matchableNames)

  if (usageRegex) {
    for (const m of text.matchAll(usageRegex)) {
      const prefix = m.groups?.prefix ?? ''
      const fullMatch = m.groups?.full
      const name = m.groups?.name
      if (!fullMatch || !name) continue

      const start = (m.index ?? 0) + prefix.length
      const end = start + fullMatch.length

      const color = varColors.get(name)
      if (!color) continue

      matches.push({ start, end, color })
    }
  }

  matches.push(...findNamespacedScssVarUsages(text, moduleColors))

  return matches
}

/**
 * Resolve loaded SCSS module variable definitions to colors.
 *
 * @param modules - Loaded SCSS modules with raw variable definitions
 * @returns Map of namespace to resolved variable color map
 */
async function resolveScssModuleColors(
  modules: ScssModule[],
): Promise<Map<string, Map<string, string>>> {
  const moduleColors = new Map<string, Map<string, string>>()

  await Promise.all(
    modules.map(async module => {
      const colors = new Map<string, string>()

      await Promise.all(
        [...module.varDefs.entries()].map(async ([name, value]) => {
          const color = await resolveVarValue(value, module.varDefs)
          if (color) {
            colors.set(name, color)
          }
        }),
      )

      if (colors.size > 0) {
        moduleColors.set(module.namespace, colors)
      }
    }),
  )

  return moduleColors
}

/**
 * Find `namespace.$var` usages for resolved SCSS module colors.
 *
 * @param text - The SCSS source text to scan
 * @param moduleColors - Resolved module colors grouped by namespace
 * @returns Array of color matches for namespaced variable usages
 */
function findNamespacedScssVarUsages(
  text: string,
  moduleColors: Map<string, Map<string, string>>,
): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const [namespace, colors] of moduleColors) {
    const usageRegex = buildNamespacedScssVarUsageRegex(namespace, [
      ...colors.keys(),
    ])
    if (!usageRegex) continue

    for (const m of text.matchAll(usageRegex)) {
      const prefix = m.groups?.prefix ?? ''
      const fullMatch = m.groups?.full
      const name = m.groups?.name
      if (!fullMatch || !name) continue

      const color = colors.get(name)
      if (!color) continue

      const start = (m.index ?? 0) + prefix.length
      const end = start + fullMatch.length

      matches.push({ start, end, color })
    }
  }

  return matches
}

/**
 * Build a regex that matches SCSS $var usages for the given variable names.
 * Skips definitions ($varName:), hyphenated names ($varName-xxx),
 * and namespaced usages (namespace.$varName).
 *
 * @param varNames - Array of SCSS variable names without the $ prefix
 * @returns A RegExp matching $name usages, or null if no names provided
 */
function buildScssVarUsageRegex(varNames: string[]): RegExp | null {
  if (varNames.length === 0) return null
  const names = varNames
    .sort((a, b) => b.length - a.length)
    .map(name => name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join('|')
  return new RegExp(
    `(?<prefix>^|[^-\\w$.])(?<full>\\$(?<name>${names}))(?![-\\w])(?!(?:\\s*:))`,
    'gmu',
  )
}

/**
 * Build a regex that matches namespaced SCSS variable usages.
 *
 * @param namespace - The namespace before `.$`
 * @param varNames - Variable names exported by the namespace
 * @returns A RegExp matching namespaced variable usages, or null if no names are provided
 */
function buildNamespacedScssVarUsageRegex(
  namespace: string,
  varNames: string[],
): RegExp | null {
  if (varNames.length === 0) return null

  const escapedNamespace = namespace.replaceAll(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`,
  )
  const names = varNames
    .sort((a, b) => b.length - a.length)
    .map(name => name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join('|')

  return new RegExp(
    `(?<prefix>^|[^-\\w$])(?<full>${escapedNamespace}\\.\\$(?<name>${names}))(?![-\\w])`,
    'gmu',
  )
}
