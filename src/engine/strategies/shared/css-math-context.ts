const MATH_FUNCTION_HEAD_REGEX =
  /(?:^|[^-\w])(?:calc|min|max|clamp|round|mod|rem|abs|sign|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp)$/iu

/**
 * Check increasing candidate offsets for enclosing CSS math arguments.
 * Scan each prefix only once, with constant memory even for unclosed input.
 * Declaration boundaries recover after incomplete calculations while nested
 * parentheses, comments, and quoted invalid operands stay inside the math.
 */
export function createCssMathContextChecker(
  text: string,
): (offset: number) => boolean {
  let cursor = 0
  let depth = 0
  let mathDepth = 0

  return offset => {
    while (cursor < offset) {
      const char = text[cursor]
      if (mathDepth && char === '/' && text[cursor + 1] === '*') {
        const end = text.indexOf('*/', cursor + 2)
        cursor = end === -1 ? text.length : end + 2
        continue
      }
      if (mathDepth && (char === '"' || char === "'")) {
        const quote = char
        cursor++
        while (
          cursor < text.length &&
          text[cursor] !== quote &&
          !/[;{}]/u.test(text[cursor])
        ) {
          cursor += text[cursor] === '\\' ? 2 : 1
        }
        if (text[cursor] === quote) {
          cursor++
        }
        continue
      }
      if (char === '(') {
        depth++
        // The longest supported name is five characters. Include one
        // boundary character so suffixes of long identifiers cannot match.
        if (
          !mathDepth &&
          MATH_FUNCTION_HEAD_REGEX.test(
            text.slice(Math.max(0, cursor - 6), cursor),
          )
        ) {
          mathDepth = depth
        }
      } else if (char === ')') {
        if (depth === mathDepth) {
          mathDepth = 0
        }
        depth = Math.max(0, depth - 1)
      } else if (char === ';' || char === '{' || char === '}') {
        depth = 0
        mathDepth = 0
      }
      cursor++
    }
    return mathDepth > 0
  }
}
