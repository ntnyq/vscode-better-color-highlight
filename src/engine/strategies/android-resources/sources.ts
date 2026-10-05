import {
  basenameWorkspacePath,
  dirnameWorkspacePath,
  getWorkspacePathIdentity,
  joinWorkspacePath,
  readWorkspaceDirectory,
  readWorkspaceFile,
  statWorkspaceFile,
} from '../../../shared/workspace/file-system'
import { createWorkspaceReadBudget } from '../../../shared/workspace/read-budget'
import type { WorkspaceReadBudget } from '../../../shared/workspace/read-budget'
import type { StrategyContext } from '../../detection'
import {
  parseAndroidResourceDocument,
  type AndroidColorDeclaration,
  type AndroidResourceDocument,
} from './parser'

export interface AndroidResourceLocation {
  readonly root: string
  readonly directory: string
}

export interface AndroidColorSource extends AndroidColorDeclaration {
  readonly filePath: string
  readonly text: string
}

const MAX_RESOURCE_FILES = 64
const MAX_RESOURCE_DIRECTORIES = 64
const MAX_DIRECTORY_ENTRIES = 4096
export const MAX_ANDROID_RESOURCE_FILE_SIZE = 512 * 1024
const RESOURCE_DIRECTORY =
  /^(?:anim|animator|color|drawable|font|interpolator|layout|menu|mipmap|navigation|transition|values|xml)(?:-[\w-]+)?$/u

/**
 * Infer exactly one resource root from an XML file directly inside res/type.
 * No Gradle, source-set, dependency, or other module discovery is performed.
 */
export function getAndroidResourceLocation(
  filePath: string,
): AndroidResourceLocation | null {
  if (!basenameWorkspacePath(filePath).endsWith('.xml')) {
    return null
  }
  const directoryPath = dirnameWorkspacePath(filePath)
  const directory = basenameWorkspacePath(directoryPath)
  const root = dirnameWorkspacePath(directoryPath)
  return basenameWorkspacePath(root) === 'res' &&
    RESOURCE_DIRECTORY.test(directory)
    ? { root, directory }
    : null
}

/**
 * Read a complete, bounded resource index for one request. No persistent cache
 * means edits, closes, creates, deletes, and renamed qualifiers take effect on
 * the next navigation request. Open document contents take precedence on disk.
 * A null entry blocks duplicate, qualified, and state-list resource names.
 */
export async function loadAndroidColorSources(
  text: string,
  document: AndroidResourceDocument,
  filePath: string,
  location: AndroidResourceLocation,
  context: StrategyContext,
): Promise<ReadonlyMap<string, AndroidColorSource | null> | null> {
  if (!context.workspaceIsTrusted || context.signal?.isCancellationRequested) {
    return null
  }
  const sources = new Map<string, AndroidColorSource | null>()
  const budget = createWorkspaceReadBudget(
    MAX_RESOURCE_FILES + MAX_RESOURCE_DIRECTORIES + 1,
  )
  const claim = (path: string): boolean =>
    budget.tryClaim(path) &&
    (context.workspaceReadBudget?.tryClaim(path) ?? true)
  try {
    const candidates = await collectResourcePaths(
      location.root,
      { tryClaim: claim },
      context,
    )
    if (!candidates || context.signal?.isCancellationRequested) {
      return null
    }
    const paths = new Map(
      candidates.map(path => [getWorkspacePathIdentity(path), path]),
    )
    const currentIdentity = getWorkspacePathIdentity(filePath)
    if (/^(?:values|color)(?:-|$)/u.test(location.directory)) {
      paths.set(currentIdentity, filePath)
    }
    if (paths.size > MAX_RESOURCE_FILES) {
      return null
    }
    for (const [identity, path] of paths) {
      if (context.signal?.isCancellationRequested) {
        return null
      }
      const candidateLocation = getAndroidResourceLocation(path)
      if (
        !candidateLocation ||
        getWorkspacePathIdentity(candidateLocation.root) !==
          getWorkspacePathIdentity(location.root)
      ) {
        return null
      }
      const directory = candidateLocation.directory
      if (/^color(?:-|$)/u.test(directory)) {
        sources.set(basenameWorkspacePath(path).slice(0, -4), null)
        continue
      }
      if (!/^values(?:-|$)/u.test(directory)) {
        return null
      }
      let sourceText = text
      let sourceDocument = document
      if (identity !== currentIdentity) {
        if (!claim(path)) {
          return null
        }
        const stat = await statWorkspaceFile(path)
        if (
          context.signal?.isCancellationRequested ||
          stat.size > MAX_ANDROID_RESOURCE_FILE_SIZE
        ) {
          return null
        }
        sourceText = await readWorkspaceFile(path)
        if (
          context.signal?.isCancellationRequested ||
          sourceText.length > MAX_ANDROID_RESOURCE_FILE_SIZE ||
          new TextEncoder().encode(sourceText).byteLength >
            MAX_ANDROID_RESOURCE_FILE_SIZE
        ) {
          return null
        }
        const parsed = parseAndroidResourceDocument(sourceText, true)
        if (!parsed) {
          return null
        }
        sourceDocument = parsed
      }
      for (const declaration of sourceDocument.declarations) {
        sources.set(
          declaration.name,
          directory !== 'values' || sources.has(declaration.name)
            ? null
            : { ...declaration, filePath: path, text: sourceText },
        )
      }
    }
    return sources
  } catch {
    // A partial index cannot prove that a name is unique.
    return null
  }
}

/**
 * Inspect only immediate values/color directories and their XML files. A
 * partial listing, unsupported entry, or exhausted budget rejects the index.
 */
async function collectResourcePaths(
  root: string,
  budget: WorkspaceReadBudget,
  context: StrategyContext,
): Promise<string[] | null> {
  if (!budget.tryClaim(root)) {
    return null
  }
  const entries = await readWorkspaceDirectory(root)
  if (
    context.signal?.isCancellationRequested ||
    entries.length > MAX_DIRECTORY_ENTRIES
  ) {
    return null
  }
  const directories = entries.filter(entry =>
    /^(?:values|color)(?:-[\w-]+)?$/u.test(entry.name),
  )
  if (directories.length > MAX_RESOURCE_DIRECTORIES) {
    return null
  }
  const paths: string[] = []
  for (const directory of directories) {
    if (directory.kind !== 'directory') {
      return null
    }
    const directoryPath = joinWorkspacePath(root, directory.name)
    if (
      !budget.tryClaim(directoryPath) ||
      context.signal?.isCancellationRequested
    ) {
      return null
    }
    const files = await readWorkspaceDirectory(directoryPath)
    if (
      context.signal?.isCancellationRequested ||
      files.length > MAX_DIRECTORY_ENTRIES
    ) {
      return null
    }
    for (const file of files) {
      if (!file.name.endsWith('.xml')) {
        continue
      }
      if (file.kind !== 'file' || /[/\\]/u.test(file.name)) {
        return null
      }
      paths.push(joinWorkspacePath(directoryPath, file.name))
      if (paths.length > MAX_RESOURCE_FILES) {
        return null
      }
    }
  }
  return paths
}
