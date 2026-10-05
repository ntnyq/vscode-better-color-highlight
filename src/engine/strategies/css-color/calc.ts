export interface CalculatedComponent {
  readonly value: number
  readonly unit: 'number' | 'percentage' | 'angle'
}

/**
 * Evaluate bounded arithmetic with typed values, without executing source code.
 * Unsupported functions, inconsistent units, and non-finite values are rejected.
 */
export function evaluateColorCalc(
  source: string,
  channels: ReadonlyMap<string, number>,
): CalculatedComponent | null {
  if (source.length > 4096) {
    return null
  }
  if (
    !/^(?:calc|min|max|clamp)\(/iu.test(source) &&
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
        ? createCalculatedComponent(
            value.value * (token === '-' ? -1 : 1),
            value.unit,
          )
        : null
    }
    if (token === '(') {
      const value = sum(depth + 1)
      return tokens[index++] === ')' ? value : null
    }
    if (
      token === 'calc' ||
      token === 'min' ||
      token === 'max' ||
      token === 'clamp'
    ) {
      if (
        tokenMatches[index]?.index !==
          tokenMatches[index - 1].index + token.length ||
        tokens[index++] !== '('
      ) {
        return null
      }
      if (token !== 'calc') {
        return comparison(token, depth + 1)
      }
      const value = sum(depth + 1)
      return tokens[index++] === ')' ? value : null
    }
    if (!token) {
      return null
    }
    const channel = channels.get(token)
    if (channel !== undefined) {
      return createCalculatedComponent(channel, 'number')
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
      return createCalculatedComponent(value, 'percentage')
    }
    if (unit) {
      return createCalculatedComponent(
        value *
          ({ turn: 360, grad: 0.9, rad: 180 / Math.PI, deg: 1 }[unit] ?? 1),
        'angle',
      )
    }
    return createCalculatedComponent(value, 'number')
  }
  function comparison(
    name: 'min' | 'max' | 'clamp',
    depth: number,
  ): CalculatedComponent | null {
    // Null represents an unbounded clamp side, never an invalid calculation.
    const args: (CalculatedComponent | null)[] = []
    do {
      if (
        name === 'clamp' &&
        (args.length === 0 || args.length === 2) &&
        tokens[index]?.toLowerCase() === 'none'
      ) {
        args.push(null)
        index++
      } else {
        const value = sum(depth)
        if (!value) {
          return null
        }
        args.push(value)
      }
      if (tokens[index] !== ',') {
        break
      }
      index++
    } while (index < tokens.length)
    if (tokens[index++] !== ')') {
      return null
    }
    const values = args.filter(value => value !== null)
    const first = values[0]
    if (!first || values.some(value => value.unit !== first.unit)) {
      return null
    }
    if (name === 'clamp') {
      if (args.length !== 3) {
        return null
      }
      const [minimum, preferred, maximum] = args
      if (!preferred) {
        return null
      }
      let value = preferred.value
      if (maximum) {
        value = Math.min(value, maximum.value)
      }
      if (minimum) {
        value = Math.max(value, minimum.value)
      }
      return { value, unit: preferred.unit }
    }
    return {
      value: Math[name](...values.map(value => value.value)),
      unit: first.unit,
    }
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
        left = createCalculatedComponent(
          left.value * right.value,
          left.unit === 'number' ? right.unit : left.unit,
        )
      } else {
        if (right.value === 0 || right.unit !== 'number') {
          return null
        }
        left = createCalculatedComponent(left.value / right.value, left.unit)
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
      left = createCalculatedComponent(
        left.value + right.value * (operator === '-' ? -1 : 1),
        left.unit,
      )
    }
    return left
  }
  const result = atom(0)
  return index === tokens.length && result && Number.isFinite(result.value)
    ? result
    : null
}

/**
 * Reject overflow before a comparison or later operation can hide it.
 */
function createCalculatedComponent(
  value: number,
  unit: CalculatedComponent['unit'],
): CalculatedComponent | null {
  return Number.isFinite(value) ? { value, unit } : null
}
