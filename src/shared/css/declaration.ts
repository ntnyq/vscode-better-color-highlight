export interface ParsedCssDeclarationValue {
  /** Whether the value ends with a CSS declaration priority annotation. */
  readonly isImportant: boolean

  /** Trimmed semantic value without a terminal priority annotation. */
  readonly value: string
}

const IMPORTANT_SUFFIX_REGEX =
  /!\s*(?:\/\*[\s\S]*?\*\/\s*)*important(?:\s|\/\*[\s\S]*?\*\/)*$/iu

/**
 * Separate a CSS declaration value from its terminal `!important` priority.
 * Comments and whitespace between the bang and `important` are accepted.
 *
 * @param rawValue - Raw declaration value text
 * @returns Semantic value and declaration priority
 */
export function parseCssDeclarationValue(
  rawValue: string,
): ParsedCssDeclarationValue {
  const value = rawValue.trim()
  const importantSuffix = value.match(IMPORTANT_SUFFIX_REGEX)

  if (!importantSuffix || importantSuffix.index === undefined) {
    return { isImportant: false, value }
  }

  return {
    isImportant: true,
    value: value.slice(0, importantSuffix.index).trimEnd(),
  }
}
