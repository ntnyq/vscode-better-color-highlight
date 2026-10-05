import type { ColorDefinitionTarget } from '../../definition/types'
import type { StrategyContext } from '../../detection'
import {
  parseAndroidColorReference,
  parseAndroidResourceDocument,
} from './parser'
import {
  getAndroidResourceLocation,
  loadAndroidColorSources,
  MAX_ANDROID_RESOURCE_FILE_SIZE,
} from './sources'

const STATIC_ANDROID_COLOR = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu
const MAX_ALIAS_DEPTH = 64

/**
 * Follow an XML @color/name reference to a unique terminal static declaration.
 * Every alias must be unqualified and unambiguous in the same resource root.
 */
export async function resolveAndroidColorDefinition(
  text: string,
  offset: number,
  context: StrategyContext,
): Promise<ColorDefinitionTarget | null> {
  if (
    context.languageId !== 'xml' ||
    !context.filePath ||
    !context.workspaceIsTrusted ||
    context.signal?.isCancellationRequested ||
    text.length > MAX_ANDROID_RESOURCE_FILE_SIZE ||
    new TextEncoder().encode(text).byteLength > MAX_ANDROID_RESOURCE_FILE_SIZE
  ) {
    return null
  }
  const location = getAndroidResourceLocation(context.filePath)
  if (!location) {
    return null
  }
  const document = parseAndroidResourceDocument(
    text,
    /^values(?:-|$)/u.test(location.directory),
  )
  const reference = document?.references.find(
    candidate => candidate.start <= offset && offset < candidate.end,
  )
  if (!document || !reference) {
    return null
  }
  const sources = await loadAndroidColorSources(
    text,
    document,
    context.filePath,
    location,
    context,
  )
  if (!sources || context.signal?.isCancellationRequested) {
    return null
  }
  const visited = new Set<string>()
  let name = reference.name
  for (let depth = 0; depth < MAX_ALIAS_DEPTH; depth++) {
    if (visited.has(name)) {
      return null
    }
    visited.add(name)
    const source = sources.get(name)
    if (!source?.value) {
      return null
    }
    if (STATIC_ANDROID_COLOR.test(source.value)) {
      return {
        originRange: { start: reference.start, end: reference.end },
        targetFilePath: source.filePath,
        targetRange: source.range,
        targetSelectionRange: source.nameRange,
        targetText: source.text,
      }
    }
    const alias = parseAndroidColorReference(source.value)
    if (!alias) {
      return null
    }
    name = alias
  }
  return null
}
