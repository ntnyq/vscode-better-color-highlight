import { rgbString } from '../../../shared/color'
import type { ColorMatch, StrategyContext } from '../../detection'
import { resolveTailwindColorValueImmediately } from './color'
import { parseTailwindThemeSource } from './parser'
import {
  resolveTailwindTheme,
  resolveTailwindThemeImmediately,
} from './resolver'
import { loadTailwindThemeSources } from './sources'
import type { TailwindColorTheme } from './types'
import {
  findTailwindColorUtilities,
  type TailwindColorUtility,
} from './utility'

type TailwindDetectorContext = Partial<StrategyContext> & {
  readonly hasV4Signal?: boolean
  readonly mode?: 'auto' | 'v3' | 'v4'
}

export interface ResolvedTailwindColorUtility {
  readonly color: string
  readonly utility: TailwindColorUtility
}

/**
 * Detect Tailwind color utilities from the current or configured theme.
 */
export function findTailwindThemeColors(text: string): ColorMatch[]
/**
 * Detect Tailwind utility colors with optional configured theme loading.
 */
export function findTailwindThemeColors(
  text: string,
  context: TailwindDetectorContext,
): ColorMatch[] | Promise<ColorMatch[]>
/**
 * Detect Tailwind utility colors with optional configured theme loading.
 */
export function findTailwindThemeColors(
  text: string,
  context?: TailwindDetectorContext,
): ColorMatch[] | Promise<ColorMatch[]> {
  const resolved = resolveTailwindColorUtilities(text, context)
  return resolved instanceof Promise
    ? projectResolvedUtilities(resolved)
    : toColorMatches(resolved)
}

/**
 * Resolve Tailwind utility colors and retain their parsed source metadata.
 */
export function resolveTailwindColorUtilities(
  text: string,
): ResolvedTailwindColorUtility[]
/**
 * Resolve Tailwind utilities, loading configured sources when applicable.
 */
export function resolveTailwindColorUtilities(
  text: string,
  context?: TailwindDetectorContext,
): ResolvedTailwindColorUtility[] | Promise<ResolvedTailwindColorUtility[]>
/**
 * Resolve Tailwind utilities against a local or configured color theme.
 */
export function resolveTailwindColorUtilities(
  text: string,
  context?: TailwindDetectorContext,
): ResolvedTailwindColorUtility[] | Promise<ResolvedTailwindColorUtility[]> {
  const normalizedContext = normalizeContext(context)
  if (shouldLoadConfiguredTheme(normalizedContext)) {
    return findWithConfiguredTheme(text, normalizedContext)
  }

  const source = parseTailwindThemeSource(text, normalizedContext.filePath)
  const theme = resolveTailwindThemeImmediately([source], {
    mode: normalizedContext.tailwindColorMode,
  })
  return resolveUtilities(text, theme)
}

/**
 * Load configured theme sources and resolve utilities unless cancelled.
 */
async function findWithConfiguredTheme(
  text: string,
  context: StrategyContext,
): Promise<ResolvedTailwindColorUtility[]> {
  if (context.signal?.isCancellationRequested) {
    return []
  }
  const sources = await loadTailwindThemeSources(text, context)
  if (context.signal?.isCancellationRequested) {
    return []
  }
  const theme = await resolveTailwindTheme(sources, {
    mode: context.tailwindColorMode,
  })
  if (context.signal?.isCancellationRequested) {
    return []
  }
  return resolveUtilities(text, theme)
}

/**
 * Resolve utility colors and opacity modifiers, removing duplicate matches.
 */
function resolveUtilities(
  text: string,
  theme: TailwindColorTheme,
): ResolvedTailwindColorUtility[] {
  const matches: ResolvedTailwindColorUtility[] = []
  const seen = new Set<string>()

  for (const utility of findTailwindColorUtilities(text)) {
    const baseColor = resolveUtilityColor(utility, theme)
    if (!baseColor) {
      continue
    }
    const alpha = parseOpacityModifier(utility.opacity)
    if (utility.opacity !== undefined && alpha === undefined) {
      continue
    }
    const color = alpha === undefined ? baseColor : applyAlpha(baseColor, alpha)
    if (!color) {
      continue
    }

    const key = `${utility.start}:${utility.end}:${color}`
    if (!seen.has(key)) {
      seen.add(key)
      matches.push({ color, utility })
    }
  }

  return matches
}

/**
 * Project resolved Tailwind utilities into detector color matches.
 */
function toColorMatches(
  resolved: readonly ResolvedTailwindColorUtility[],
): ColorMatch[] {
  return resolved.map(({ color, utility }) => ({
    color,
    editMode: 'read-only',
    end: utility.end,
    start: utility.start,
  }))
}

/**
 * Await resolved Tailwind utilities and project them into color matches.
 */
async function projectResolvedUtilities(
  resolved: Promise<readonly ResolvedTailwindColorUtility[]>,
): Promise<ColorMatch[]> {
  return toColorMatches(await resolved)
}

/**
 * Resolve an arbitrary color or look up a named theme color for a utility.
 */
function resolveUtilityColor(
  utility: TailwindColorUtility,
  theme: TailwindColorTheme,
): string | null {
  if (utility.kind === 'arbitrary') {
    return resolveTailwindColorValueImmediately(utility.value)
  }

  const name =
    utility.kind === 'property' && utility.value.startsWith('--color-')
      ? utility.value.slice('--color-'.length)
      : utility.value
  return theme.colors.get(name)?.value ?? null
}

/**
 * Fill detector context defaults and apply explicit Tailwind v4 signals.
 */
function normalizeContext(
  context: TailwindDetectorContext = {},
): StrategyContext {
  const requestedMode = context.mode ?? context.tailwindColorMode ?? 'auto'
  return {
    ...context,
    languageId: context.languageId ?? 'plaintext',
    tailwindColorMode:
      requestedMode === 'auto' && context.hasV4Signal ? 'v4' : requestedMode,
  }
}

/**
 * Check whether trusted configured theme sources can be loaded.
 */
function shouldLoadConfiguredTheme(context: StrategyContext): boolean {
  return Boolean(
    context.workspaceIsTrusted &&
    context.filePath &&
    context.tailwindStylesheetPaths?.length,
  )
}

/**
 * Parse a static Tailwind opacity modifier and clamp it to zero through one.
 */
function parseOpacityModifier(value: string | undefined): number | undefined {
  if (value === undefined || value.startsWith('(')) {
    return undefined
  }

  const arbitrary = value.startsWith('[') && value.endsWith(']')
  const normalized = arbitrary ? value.slice(1, -1) : value
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)%?$/u.test(normalized)) {
    return undefined
  }

  let numericValue: number
  if (normalized.endsWith('%')) {
    numericValue = Number(normalized.slice(0, -1)) / 100
  } else {
    numericValue = Number(normalized)
    if (!arbitrary && !normalized.includes('.')) {
      numericValue /= 100
    }
  }

  return Number.isFinite(numericValue)
    ? Math.min(Math.max(numericValue, 0), 1)
    : undefined
}

/**
 * Multiply a serialized RGB color's existing alpha by the utility opacity.
 */
function applyAlpha(color: string, alpha: number): string | null {
  const channels = color.match(
    /^rgba?\((?<red>\d+), (?<green>\d+), (?<blue>\d+)(?:, (?<alpha>[\d.]+))?\)$/u,
  )
  const red = channels?.groups?.red
  const green = channels?.groups?.green
  const blue = channels?.groups?.blue
  const existingAlpha = Number(channels?.groups?.alpha ?? 1)

  return channels
    ? rgbString(Number(red), Number(green), Number(blue), existingAlpha * alpha)
    : null
}
