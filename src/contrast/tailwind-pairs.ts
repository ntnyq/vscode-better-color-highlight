import { resolveTailwindColorUtilities } from '../strategies/tailwind-theme-colors'
import type { ResolvedTailwindColorUtility } from '../strategies/tailwind-theme-colors'
import {
  findTailwindColorUtilities,
  type TailwindColorUtility,
} from '../strategies/tailwind-theme/utility'
import type { StrategyContext } from '../types'
import { parseResolvedColor } from '../utils/color/presentation'
import { evaluateColorContrast } from './evaluate'
import {
  collectStaticMarkupContexts,
  MARKUP_LANGUAGES,
} from './markup-contexts'
import type { ResolvedContrastColor, ResolvedContrastPair } from './types'

interface UtilityGroup {
  background?: TailwindColorUtility
  foreground?: TailwindColorUtility
  hasBackgroundImage: boolean
  readonly variants: readonly string[]
}

const NON_COLOR_TEXT_VALUES = new Set([
  'balance',
  'center',
  'clip',
  'ellipsis',
  'end',
  'justify',
  'left',
  'nowrap',
  'pretty',
  'right',
  'start',
  'wrap',
])

const NON_COLOR_BACKGROUND_VALUES = new Set([
  'auto',
  'bottom',
  'center',
  'clip-border',
  'clip-content',
  'clip-padding',
  'clip-text',
  'contain',
  'cover',
  'fixed',
  'left',
  'left-bottom',
  'left-top',
  'local',
  'no-repeat',
  'origin-border',
  'origin-content',
  'origin-padding',
  'repeat',
  'repeat-round',
  'repeat-space',
  'repeat-x',
  'repeat-y',
  'right',
  'right-bottom',
  'right-top',
  'scroll',
  'top',
])

const CSS_LENGTH_REGEX =
  /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:cap|ch|cm|dvb|dvh|dvi|dvw|em|ex|ic|in|lvb|lvh|lvi|lvw|lh|mm|pc|pt|px|q|rem|rlh|svb|svh|svi|svw|vb|vh|vi|vmax|vmin|vw)$/iu

/** Resolve same-attribute Tailwind foreground/background utility pairs. */
export async function findTailwindContrastPairs(
  text: string,
  context: StrategyContext,
): Promise<ResolvedContrastPair[]> {
  if (!MARKUP_LANGUAGES.has(context.languageId)) {
    return []
  }
  const attributes = collectStaticMarkupContexts(
    text,
    context.languageId,
  ).attributes.filter(
    attribute => attribute.name === 'class' || attribute.name === 'classname',
  )
  if (attributes.length === 0) {
    return []
  }

  const resolved = await resolveTailwindColorUtilities(text, context)
  if (context.signal?.isCancellationRequested) {
    return []
  }
  const resolvedByRange = new Map(
    resolved.map(item => [utilityKey(item.utility), item]),
  )
  const rawUtilities = findTailwindColorUtilities(text)
  const pairs: ResolvedContrastPair[] = []
  for (const attribute of attributes) {
    if (context.signal?.isCancellationRequested) {
      return []
    }
    const attributeText = text.slice(attribute.valueStart, attribute.valueEnd)
    if (!isStaticRenderableClass(attributeText)) {
      continue
    }
    const groups = collectUtilityGroups(
      attribute,
      rawUtilities,
      resolvedByRange,
    )

    for (const group of groups.values()) {
      if (context.signal?.isCancellationRequested) {
        return []
      }
      if (group.hasBackgroundImage || !group.background || !group.foreground) {
        continue
      }
      const resolvedBackground = resolvedByRange.get(
        utilityKey(group.background),
      )
      const resolvedForeground = resolvedByRange.get(
        utilityKey(group.foreground),
      )
      if (!resolvedBackground || !resolvedForeground) {
        continue
      }
      const background = toContrastColor(text, resolvedBackground)
      const foreground = toContrastColor(text, resolvedForeground)
      const parsedBackground = parseResolvedColor(background.color)
      const parsedForeground = parseResolvedColor(foreground.color)
      if (
        !parsedBackground ||
        !parsedForeground ||
        evaluateColorContrast(parsedForeground, parsedBackground).kind !==
          'determinate'
      ) {
        continue
      }
      const serializedVariants = JSON.stringify(group.variants)
      pairs.push({
        background,
        contextKey: `tailwind:${attribute.valueStart}:${serializedVariants}`,
        foreground,
        variantKey: group.variants.join(':'),
      })
    }
  }
  return pairs
}

function collectUtilityGroups(
  attribute: { readonly valueEnd: number; readonly valueStart: number },
  rawUtilities: readonly TailwindColorUtility[],
  resolvedByRange: ReadonlyMap<string, ResolvedTailwindColorUtility>,
): ReadonlyMap<string, UtilityGroup> {
  const groups = new Map<string, UtilityGroup>()
  for (const utility of rawUtilities) {
    if (
      utility.start < attribute.valueStart ||
      utility.end > attribute.valueEnd ||
      (utility.prefix !== 'bg' && utility.prefix !== 'text')
    ) {
      continue
    }
    const key = JSON.stringify(utility.variants)
    const group = groups.get(key) ?? {
      hasBackgroundImage: false,
      variants: utility.variants,
    }
    const isResolved = resolvedByRange.has(utilityKey(utility))
    if (utility.prefix === 'bg') {
      updateBackgroundGroup(group, utility, isResolved)
    } else if (isResolved || !isKnownNonColorTextUtility(utility)) {
      group.foreground = utility
    }
    groups.set(key, group)
  }
  return groups
}

function isStaticRenderableClass(text: string): boolean {
  return !/[{}]/u.test(text)
}

function updateBackgroundGroup(
  group: UtilityGroup,
  utility: TailwindColorUtility,
  isResolved: boolean,
): void {
  if (isBackgroundImageReset(utility)) {
    group.hasBackgroundImage = false
    return
  }
  if (isBackgroundImageUtility(utility)) {
    group.hasBackgroundImage = true
    return
  }
  if (isResolved || !isKnownNonColorBackgroundUtility(utility)) {
    group.background = utility
  }
}

function isKnownNonColorTextUtility(utility: TailwindColorUtility): boolean {
  if (utility.kind === 'arbitrary') {
    const value = normalizeArbitraryValue(utility.value)
    return (
      CSS_LENGTH_REGEX.test(value) ||
      /^[+-]?(?:0+(?:\.0*)?|\.0+)$/u.test(value) ||
      /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$/u.test(value) ||
      /^(?:calc|clamp|max|min)\s*\(/iu.test(value) ||
      /^(?:absolute-size|length|relative-size):/u.test(value)
    )
  }
  return (
    utility.kind === 'named' &&
    (/^(?:base|[2-9]?xl|lg|sm|xs)$/u.test(utility.value) ||
      NON_COLOR_TEXT_VALUES.has(utility.value))
  )
}

function isKnownNonColorBackgroundUtility(
  utility: TailwindColorUtility,
): boolean {
  if (utility.kind === 'arbitrary') {
    return /^(?:length|percentage|position|size):/u.test(utility.value)
  }
  return (
    utility.kind === 'named' && NON_COLOR_BACKGROUND_VALUES.has(utility.value)
  )
}

function isBackgroundImageUtility(utility: TailwindColorUtility): boolean {
  if (utility.kind === 'arbitrary') {
    const value = normalizeArbitraryValue(utility.value)
    return (
      value.startsWith('image:') ||
      /^(?:cross-fade|image|image-set|(?:repeating-)?(?:conic|linear|radial)-gradient|url)\s*\(/iu.test(
        value,
      )
    )
  }
  return (
    utility.kind === 'named' &&
    /^(?:conic(?:-.+)?|gradient-to-.+|linear(?:-.+)?|radial(?:-.+)?)$/u.test(
      utility.value,
    )
  )
}

function isBackgroundImageReset(utility: TailwindColorUtility): boolean {
  return utility.kind === 'named'
    ? utility.value === 'none'
    : /^image:\s*none$/iu.test(normalizeArbitraryValue(utility.value))
}

function normalizeArbitraryValue(value: string): string {
  return value.replaceAll('_', ' ').trim()
}

function utilityKey(utility: TailwindColorUtility): string {
  return `${utility.start}:${utility.end}`
}

function toContrastColor(
  text: string,
  resolved: ResolvedTailwindColorUtility,
): ResolvedContrastColor {
  const { color, utility } = resolved
  return {
    color,
    originalText: text.slice(utility.start, utility.end),
    range: { end: utility.end, start: utility.start },
  }
}
