/**
 * Workspace file metadata used by the SCSS resolver cache.
 */
export interface WorkspaceFileStat {
  /**
   * Last known file modification timestamp.
   */
  readonly mtimeMs: number

  /**
   * File size in bytes.
   */
  readonly size: number
}

/**
 * Parsed workspace path parts.
 */
export interface WorkspacePathParts {
  /**
   * URI prefix before the path, or empty for plain paths.
   */
  readonly prefix: string

  /**
   * Path component.
   */
  readonly path: string

  /**
   * Whether the original value was a URI string.
   */
  readonly isUri: boolean
}
