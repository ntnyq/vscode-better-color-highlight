import type { CancellationSignal } from '../../detection'

/**
 * Resolve each variable once, iteratively following aliases and caching failures.
 * Work and memory are bounded by the number of definitions, including cycles.
 */
export async function resolveVariableColors(
  definitions: ReadonlyMap<string, string>,
  getAlias: (value: string) => string | null,
  resolveLiteral: (value: string, name: string) => Promise<string | null>,
  signal?: CancellationSignal,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string | null>()
  const colors = new Map<string, string>()

  for (const name of definitions.keys()) {
    const path = new Set<string>()
    let current: string | null = name
    let color: string | null = null

    while (current !== null) {
      if (signal?.isCancellationRequested) {
        return new Map()
      }
      if (resolved.has(current)) {
        color = resolved.get(current) ?? null
        break
      }
      if (path.has(current)) {
        break
      }
      const value = definitions.get(current)
      if (value === undefined) {
        break
      }
      path.add(current)
      const normalized = value.replaceAll(/!important\b/gu, '').trim()
      color = await resolveLiteral(normalized, current)
      if (signal?.isCancellationRequested) {
        return new Map()
      }
      if (color) {
        break
      }
      current = getAlias(normalized)
    }

    for (const visited of path) {
      resolved.set(visited, color)
      if (color) {
        colors.set(visited, color)
      }
    }
  }

  return colors
}
