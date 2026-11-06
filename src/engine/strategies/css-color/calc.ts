export interface CalculatedComponent {
  readonly value: number
  readonly unit: 'number' | 'percentage' | 'angle'
}

type ColorRoundingStrategy = 'nearest' | 'up' | 'down' | 'to-zero'

const SCIENTIFIC_FUNCTIONS = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'pow',
  'sqrt',
  'hypot',
  'log',
  'exp',
] as const

type ColorScientificFunction = (typeof SCIENTIFIC_FUNCTIONS)[number]

function isScientificFunction(
  name: string | undefined,
): name is ColorScientificFunction {
  return SCIENTIFIC_FUNCTIONS.some(candidate => candidate === name)
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
    !/^(?:calc|min|max|clamp|round|mod|rem|abs|sign|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp)\(/iu.test(
      source,
    ) &&
    !/^(?:[a-z]+|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?(?:%|deg|grad|rad|turn)?)$/iu.test(
      source,
    )
  ) {
    return null
  }
  const tokenMatches = [
    ...source.matchAll(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?(?:%|deg|grad|rad|turn)?|[a-z][a-z0-9]*(?:-[a-z0-9]+)*|[^\s]/giu,
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
      // A sign belongs to the numeric token; it does not add parentheses.
      const value = atom(depth)
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
      token === 'clamp' ||
      token === 'round' ||
      token === 'mod' ||
      token === 'rem' ||
      token === 'abs' ||
      token === 'sign' ||
      isScientificFunction(token)
    ) {
      if (
        tokenMatches[index]?.index !==
          tokenMatches[index - 1].index + token.length ||
        tokens[index++] !== '('
      ) {
        return null
      }
      if (token === 'round' || token === 'mod' || token === 'rem') {
        return stepped(token, depth + 1)
      }
      if (token === 'abs' || token === 'sign') {
        const value = sum(depth + 1)
        if (!value || tokens[index++] !== ')') {
          return null
        }
        // abs preserves the input type; sign always produces a number.
        // Math.abs clears negative zero while Math.sign preserves its sign.
        return createCalculatedComponent(
          Math[token](value.value),
          token === 'sign' ? 'number' : value.unit,
        )
      }
      if (token === 'min' || token === 'max' || token === 'clamp') {
        return comparison(token, depth + 1)
      }
      if (token !== 'calc') {
        return numericFunction(token, depth + 1)
      }
      const value = sum(depth + 1)
      return tokens[index++] === ')' ? value : null
    }
    if (!token) {
      return null
    }
    if (token === 'pi' || token === 'e') {
      // CSS constants are only keywords within a calculation, never bare
      // color components (including in relative colors).
      return depth > 0
        ? createCalculatedComponent(token === 'pi' ? Math.PI : Math.E, 'number')
        : null
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
  function numericFunction(
    name: ColorScientificFunction,
    depth: number,
  ): CalculatedComponent | null {
    const args: CalculatedComponent[] = []
    do {
      const value = sum(depth)
      if (!value) {
        return null
      }
      args.push(value)
      if (tokens[index] !== ',') {
        break
      }
      index++
    } while (index < tokens.length)
    if (tokens[index++] !== ')') {
      return null
    }
    const [first, second] = args
    if (!first) {
      return null
    }
    if (name === 'hypot' || name === 'atan2') {
      if (args.some(value => value.unit !== first.unit)) {
        return null
      }
      if (name === 'hypot') {
        // Scaling inside Math.hypot avoids overflow from squaring finite
        // operands when their vector length is still representable.
        return createCalculatedComponent(
          Math.hypot(...args.map(value => value.value)),
          first.unit,
        )
      }
      return args.length === 2 && second
        ? createCalculatedComponent(
            Math.atan2(first.value, second.value) * (180 / Math.PI),
            'angle',
          )
        : null
    }
    if (name === 'sin' || name === 'cos' || name === 'tan') {
      if (args.length !== 1 || first.unit === 'percentage') {
        return null
      }
      const halfTurn = first.unit === 'angle' ? 180 : Math.PI
      const phase = first.value % (2 * halfTurn)
      // Resolve exact quadrants in the input unit. A tiny Math.sin/cos
      // residual would otherwise become +/-1 under sign(). No epsilon is
      // used, so neighboring finite angles retain their sign and magnitude.
      if (phase % halfTurn === 0) {
        if (name === 'cos') {
          return createCalculatedComponent(phase === 0 ? 1 : -1, 'number')
        }
        return createCalculatedComponent(
          first.value === 0 ? first.value : 0,
          'number',
        )
      }
      if (
        Math.abs(phase) === halfTurn / 2 ||
        Math.abs(phase) === halfTurn * 1.5
      ) {
        // Exact tangent poles have no portable finite preview.
        if (name === 'tan') {
          return null
        }
        const sine =
          Math.sign(phase) * (Math.abs(phase) === halfTurn / 2 ? 1 : -1)
        return createCalculatedComponent(name === 'cos' ? 0 : sine, 'number')
      }
      const radians =
        first.unit === 'angle' ? phase * (Math.PI / 180) : first.value
      return createCalculatedComponent(Math[name](radians), 'number')
    }
    if (args.some(value => value.unit !== 'number')) {
      return null
    }
    if (name === 'pow') {
      return args.length === 2 && second
        ? createCalculatedComponent(first.value ** second.value, 'number')
        : null
    }
    if (name === 'log') {
      if (
        args.length > 2 ||
        first.value <= 0 ||
        (second && (second.value <= 0 || second.value === 1))
      ) {
        return null
      }
      return createCalculatedComponent(
        first.value === 1
          ? 0
          : Math.log(first.value) / (second ? Math.log(second.value) : 1),
        'number',
      )
    }
    if (args.length !== 1) {
      return null
    }
    if (name === 'asin' || name === 'acos' || name === 'atan') {
      return createCalculatedComponent(
        Math[name](first.value) * (180 / Math.PI),
        'angle',
      )
    }
    return createCalculatedComponent(Math[name](first.value), 'number')
  }
  function stepped(
    name: 'round' | 'mod' | 'rem',
    depth: number,
  ): CalculatedComponent | null {
    let strategy: ColorRoundingStrategy = 'nearest'
    const candidate = tokens[index]?.toLowerCase()
    if (
      name === 'round' &&
      (candidate === 'nearest' ||
        candidate === 'up' ||
        candidate === 'down' ||
        candidate === 'to-zero')
    ) {
      strategy = candidate
      index++
      if (tokens[index++] !== ',') {
        return null
      }
    }
    const value = sum(depth)
    if (!value) {
      return null
    }
    let step: CalculatedComponent | null = { value: 1, unit: 'number' }
    if (tokens[index] === ',') {
      index++
      step = sum(depth)
    } else if (name !== 'round' || value.unit !== 'number') {
      return null
    }
    if (
      tokens[index++] !== ')' ||
      !step ||
      step.unit !== value.unit ||
      step.value === 0
    ) {
      return null
    }
    const remainder = value.value % step.value
    if (name === 'rem') {
      return createCalculatedComponent(remainder, value.unit)
    }
    if (name === 'mod') {
      if (remainder === 0) {
        return createCalculatedComponent(step.value < 0 ? -0 : 0, value.unit)
      }
      const result =
        Math.sign(remainder) === Math.sign(step.value)
          ? remainder
          : remainder + step.value
      // Absorption can round an opposite-sign remainder to the excluded B
      // endpoint. Skip a result whose required open interval is unrepresentable.
      return Math.abs(result) < Math.abs(step.value)
        ? createCalculatedComponent(result, value.unit)
        : null
    }
    const rounded = roundColorValue(value.value, Math.abs(step.value), strategy)
    return rounded === null
      ? null
      : createCalculatedComponent(rounded, value.unit)
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

/**
 * Round on the canonical decimal grid without a lossy floating-point quotient.
 * Finite numbers need at most 17 coefficient digits and 632 scale positions,
 * keeping the integer work bounded independently of the input expression.
 */
function roundColorValue(
  value: number,
  interval: number,
  strategy: ColorRoundingStrategy,
): number | null {
  if (!Number.isFinite(value / interval)) {
    return null
  }
  const decimalValue = toDecimalCoefficient(value)
  const decimalInterval = toDecimalCoefficient(interval)
  const exponent = Math.min(decimalValue.exponent, decimalInterval.exponent)
  const dividend =
    decimalValue.coefficient * 10n ** BigInt(decimalValue.exponent - exponent)
  const divisor =
    decimalInterval.coefficient *
    10n ** BigInt(decimalInterval.exponent - exponent)
  if (dividend % divisor === 0n) {
    return value
  }
  const truncated = dividend / divisor
  const lower = dividend < 0n ? truncated - 1n : truncated
  const upper = lower + 1n
  let multiple: bigint
  switch (strategy) {
    case 'up': {
      multiple = upper
      break
    }
    case 'down': {
      multiple = lower
      break
    }
    case 'to-zero': {
      multiple = truncated
      break
    }
    default: {
      multiple =
        dividend - lower * divisor < upper * divisor - dividend ? lower : upper
    }
  }
  if (multiple === 0n) {
    return value < 0 ? -0 : 0
  }
  const result = Number(`${multiple * divisor}e${exponent}`)
  return Number.isFinite(result) ? result : null
}

/**
 * Decompose a finite number's shortest decimal representation into integers.
 */
function toDecimalCoefficient(value: number): {
  readonly coefficient: bigint
  readonly exponent: number
} {
  const [mantissa, exponent = '0'] = value.toString().split('e')
  const fractionalDigits = mantissa.split('.')[1]?.length ?? 0
  return {
    coefficient: BigInt(mantissa.replace('.', '')),
    exponent: Number(exponent) - fractionalDigits,
  }
}
