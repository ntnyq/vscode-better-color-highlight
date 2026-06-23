/**
 * Disposable type that extends a given type T with a dispose method.
 */
export type Disposable<T> = T & {
  dispose: () => void
}
