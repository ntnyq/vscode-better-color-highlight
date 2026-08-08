type ObjectConfigSource<TKey extends string, TValue extends object> = Record<
  TKey,
  TValue
> & {
  readonly get?: <T>(section: string) => T | undefined
}

/** Read an object setting without leaking reactive-vscode's nested proxy. */
export function readObjectConfigValue<
  TKey extends string,
  TValue extends object,
>(
  source: ObjectConfigSource<TKey, TValue>,
  key: TKey,
  fallback: TValue,
): TValue {
  return typeof source.get === 'function'
    ? (source.get<TValue>(key) ?? fallback)
    : (source[key] ?? fallback)
}
