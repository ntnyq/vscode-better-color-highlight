export interface CalculatedComponent {
  readonly value: number
  readonly unit: 'number' | 'percentage' | 'angle'
}

/**
 * Evaluate bounded arithmetic with typed values, without executing source code.
 * Unsupported functions, mixed-unit sums, and non-finite results are rejected.
 */
export function evaluateColorCalc(
  source: string,
  channels: ReadonlyMap<string, number>,
): CalculatedComponent | null {
  if (source.length > 4096) {
    return null
  }
  if (
    !/^calc\(/iu.test(source) &&
    !/^(?:[a-z]+|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?(?:%|deg|grad|rad|turn)?)$/iu.test(
      source,
    )
  ) {
    return null
  }
  const tokenMatches = [
    ...source.matchAll(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?(?:%|deg|grad|rad|turn)?|[a-z]+|[^\s]/giu,
    ),
  ]
  const tokens = tokenMatches.map(match => match[0])
  if (tokens.length > 256) {
    return null
  }
  let index = 0
  function atom(depth: number): CalculatedComponent | null {
    if (depth > 32) {
      return null
    }
    const token = tokens[index++]?.toLowerCase()
    if (token === '+' || token === '-') {
      if (
        !/^[\d.]/u.test(tokens[index] ?? '') ||
        tokenMatches[index].index !== tokenMatches[index - 1].index + 1
      ) {
        return null
      }
      const value = atom(depth + 1)
      return value
        ? { ...value, value: value.value * (token === '-' ? -1 : 1) }
        : null
    }
    if (token === '(' || token === 'calc') {
      if (
        token === 'calc' &&
        tokenMatches[index]?.index !== tokenMatches[index - 1].index + 4
      ) {
        return null
      }
      if (token === 'calc' && tokens[index++] !== '(') {
        return null
      }
      const value = sum(depth + 1)
      return tokens[index++] === ')' ? value : null
    }
    if (!token) {
      return null
    }
    const channel = channels.get(token)
    if (channel !== undefined) {
      return { value: channel, unit: 'number' }
    }
    const match = token.match(
      /^(?<value>(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)(?<unit>%|deg|grad|rad|turn)?$/u,
    )
    if (!match?.groups) {
      return null
    }
    const value = Number(match.groups.value)
    const unit = match.groups.unit
    if (unit === '%') {
      return { value, unit: 'percentage' }
    }
    if (unit) {
      return {
        value:
          value *
          ({ turn: 360, grad: 0.9, rad: 180 / Math.PI, deg: 1 }[unit] ?? 1),
        unit: 'angle',
      }
    }
    return { value, unit: 'number' }
  }
  function product(depth: number): CalculatedComponent | null {
    let left = atom(depth)
    while (left && (tokens[index] === '*' || tokens[index] === '/')) {
      const operator = tokens[index++]
      const right = atom(depth)
      if (!right) {
        return null
      }
      if (operator === '*') {
        if (left.unit !== 'number' && right.unit !== 'number') {
          return null
        }
        left = {
          value: left.value * right.value,
          unit: left.unit === 'number' ? right.unit : left.unit,
        }
      } else {
        if (right.value === 0 || right.unit !== 'number') {
          return null
        }
        left = { value: left.value / right.value, unit: left.unit }
      }
    }
    return left
  }
  function sum(depth: number): CalculatedComponent | null {
    let left = product(depth)
    while (left && (tokens[index] === '+' || tokens[index] === '-')) {
      const offset = tokenMatches[index].index
      if (
        !/\s/u.test(source[offset - 1] ?? '') ||
        !/\s/u.test(source[offset + 1] ?? '')
      ) {
        return null
      }
      const operator = tokens[index++]
      const right = product(depth)
      if (!right || left.unit !== right.unit) {
        return null
      }
      left = {
        value: left.value + right.value * (operator === '-' ? -1 : 1),
        unit: left.unit,
      }
    }
    return left
  }
  const result = atom(0)
  return index === tokens.length && result && Number.isFinite(result.value)
    ? result
    : null
}
