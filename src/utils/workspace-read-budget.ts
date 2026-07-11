import { getWorkspacePathIdentity } from './workspace-file-system'

export interface WorkspaceReadBudget {
  readonly tryClaim: (uri: string) => boolean
}

/** Create a shared bound for unique workspace dependency reads. */
export function createWorkspaceReadBudget(
  maxUniqueReads: number,
): WorkspaceReadBudget {
  if (!Number.isInteger(maxUniqueReads) || maxUniqueReads <= 0) {
    throw new RangeError('maxUniqueReads must be a positive integer')
  }

  const claimed = new Set<string>()
  return {
    tryClaim(value) {
      const identity = getWorkspacePathIdentity(value)
      if (claimed.has(identity)) {
        return true
      }
      if (claimed.size >= maxUniqueReads) {
        return false
      }
      claimed.add(identity)
      return true
    },
  }
}
