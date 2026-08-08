import type { AnsiPaletteOverrides } from '../../detection'
import { resolveAnsiPaletteColor } from './palette'
import type { RgbChannels } from './palette'

type ColorRole = 'background' | 'foreground'

interface ColorOperation {
  readonly color: RgbChannels
  readonly consumedParameterCount: number
  readonly role: ColorRole
}

/** Resolve the preview color represented by one SGR parameter list. */
export function resolveAnsiSgrColor(
  parameters: string,
  palette?: AnsiPaletteOverrides,
): RgbChannels | null {
  const parameterValues = parameters.split(';')
  let foreground: RgbChannels | null = null
  let background: RgbChannels | null = null

  for (let index = 0; index < parameterValues.length; index++) {
    const parameter = parameterValues[index]
    if (parameter === undefined) {
      break
    }

    if (parameter.includes(':')) {
      const operation = parseColonColorOperation(parameter, palette)
      if (operation?.role === 'foreground') {
        foreground = operation.color
      } else if (operation) {
        background = operation.color
      }
      continue
    }

    const value = parameter === '' ? 0 : Number(parameter)
    if (value === 0) {
      foreground = null
      background = null
      continue
    }
    if (value === 39) {
      foreground = null
      continue
    }
    if (value === 49) {
      background = null
      continue
    }

    const operation = parseSemicolonColorOperation(
      parameterValues,
      index,
      palette,
    )
    if (!operation) {
      index += getExtendedParameterCount(parameterValues, index) - 1
      continue
    }
    if (operation.role === 'foreground') {
      foreground = operation.color
    } else {
      background = operation.color
    }
    index += operation.consumedParameterCount - 1
  }

  return background ?? foreground
}

function getExtendedParameterCount(
  parameters: readonly string[],
  index: number,
): number {
  if (!getExtendedColorRole(Number(parameters[index]))) {
    return 1
  }

  const mode = parseRequiredParameter(parameters[index + 1])
  if (mode === 5) {
    return 3
  }
  if (mode === 2) {
    return 5
  }
  return 1
}

function parseColonColorOperation(
  parameter: string,
  palette?: AnsiPaletteOverrides,
): ColorOperation | null {
  const values = parameter.split(':')
  const role = getExtendedColorRole(parseRequiredParameter(values[0]))
  const mode = parseRequiredParameter(values[1])
  if (!role) {
    return null
  }
  if (mode === 5 && values.length === 3) {
    const color = resolveAnsiPaletteColor(
      parseRequiredParameter(values[2]),
      palette,
    )
    return color ? { color, consumedParameterCount: 1, role } : null
  }
  if (mode !== 2 || values.length !== 6) {
    return null
  }

  const color = toRgbChannels(values.slice(3).map(parseRequiredParameter))
  return color ? { color, consumedParameterCount: 1, role } : null
}

function parseSemicolonColorOperation(
  parameters: readonly string[],
  index: number,
  palette?: AnsiPaletteOverrides,
): ColorOperation | null {
  const value = Number(parameters[index])
  const basicOperation = parseBasicColorOperation(value, palette)
  if (basicOperation) {
    return basicOperation
  }

  const role = getExtendedColorRole(value)
  if (!role) {
    return null
  }

  const mode = parseRequiredParameter(parameters[index + 1])
  if (mode === 5) {
    const color = resolveAnsiPaletteColor(
      parseRequiredParameter(parameters[index + 2]),
      palette,
    )
    return color ? { color, consumedParameterCount: 3, role } : null
  }
  if (mode !== 2) {
    return null
  }

  const color = toRgbChannels(
    parameters.slice(index + 2, index + 5).map(parseRequiredParameter),
  )
  return color ? { color, consumedParameterCount: 5, role } : null
}

function parseBasicColorOperation(
  value: number,
  palette?: AnsiPaletteOverrides,
): ColorOperation | null {
  const resolved = resolveBasicColor(value)
  if (!resolved) {
    return null
  }
  const color = resolveAnsiPaletteColor(resolved.paletteIndex, palette)
  return color
    ? {
        color,
        consumedParameterCount: 1,
        role: resolved.role,
      }
    : null
}

function resolveBasicColor(
  value: number,
): { readonly paletteIndex: number; readonly role: ColorRole } | null {
  if (value >= 30 && value <= 37) {
    return { paletteIndex: value - 30, role: 'foreground' }
  }
  if (value >= 40 && value <= 47) {
    return { paletteIndex: value - 40, role: 'background' }
  }
  if (value >= 90 && value <= 97) {
    return { paletteIndex: value - 82, role: 'foreground' }
  }
  if (value >= 100 && value <= 107) {
    return { paletteIndex: value - 92, role: 'background' }
  }
  return null
}

function getExtendedColorRole(value: number): ColorRole | null {
  if (value === 38) {
    return 'foreground'
  }
  if (value === 48) {
    return 'background'
  }
  return null
}

function toRgbChannels(values: readonly number[]): RgbChannels | null {
  if (values.length !== 3 || !values.every(isByte)) {
    return null
  }
  return [values[0], values[1], values[2]]
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255
}

function parseRequiredParameter(value: string | undefined): number {
  return value && /^\d+$/u.test(value) ? Number(value) : Number.NaN
}
