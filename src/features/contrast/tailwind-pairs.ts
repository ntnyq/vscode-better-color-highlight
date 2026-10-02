import type { StrategyContext } from '../../engine/detection'
import { resolveTailwindColorUtilities } from '../../engine/strategies/tailwind-theme'
import type { ResolvedTailwindColorUtility } from '../../engine/strategies/tailwind-theme'
import {
  findTailwindColorUtilities,
  type TailwindColorUtility,
} from '../../engine/strategies/tailwind-theme/utility'
import { parseResolvedColor } from '../../shared/color/presentation'
import { evaluateColorContrast } from './evaluate'
import {
  collectStaticMarkupContexts,
  MARKUP_LANGUAGES,
} from './markup-contexts'
import type { ResolvedContrastColor, ResolvedContrastPair } from './types'

interface UtilityGroup {
  readonly backgrounds: TailwindColorUtility[]
  readonly foregrounds: TailwindColorUtility[]
  readonly images: TailwindColorUtility[]
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

/**
 * Resolve same-attribute Tailwind foreground/background utility pairs.
 */
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
  let utilityIndex = 0
  for (const attribute of attributes) {
    if (context.signal?.isCancellationRequested) {
      return []
    }
    const attributeUtilities = takeAttributeUtilities(
      rawUtilities,
      utilityIndex,
      attribute,
    )
    utilityIndex = attributeUtilities.nextIndex
    const attributeText = text.slice(attribute.valueStart, attribute.valueEnd)
    if (!isStaticRenderableClass(attributeText)) {
      continue
    }
    const groups = collectUtilityGroups(
      attribute,
      attributeUtilities.utilities,
      resolvedByRange,
    )

    for (const group of groups.values()) {
      if (context.signal?.isCancellationRequested) {
        return []
      }
      const backgroundUtility = selectUnambiguousUtility(group.backgrounds)
      const foregroundUtility = selectUnambiguousUtility(group.foregrounds)
      const imageUtility = selectUnambiguousUtility(group.images)
      if (
        !backgroundUtility ||
        !foregroundUtility ||
        imageUtility === null ||
        (imageUtility && !isBackgroundImageReset(imageUtility))
      ) {
        continue
      }
      const resolvedBackground = resolvedByRange.get(
        utilityKey(backgroundUtility),
      )
      const resolvedForeground = resolvedByRange.get(
        utilityKey(foregroundUtility),
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

/**
 * Take source-ordered utilities overlapping an attribute and advance the
 * cursor.
 */
function takeAttributeUtilities(
  rawUtilities: readonly TailwindColorUtility[],
  initialIndex: number,
  attribute: { readonly valueEnd: number; readonly valueStart: number },
): {
  readonly nextIndex: number
  readonly utilities: readonly TailwindColorUtility[]
} {
  let startIndex = initialIndex
  while (
    startIndex < rawUtilities.length &&
    rawUtilities[startIndex].end <= attribute.valueStart
  ) {
    startIndex++
  }
  let endIndex = startIndex
  while (
    endIndex < rawUtilities.length &&
    rawUtilities[endIndex].start < attribute.valueEnd
  ) {
    endIndex++
  }
  return {
    nextIndex: endIndex,
    utilities: rawUtilities.slice(startIndex, endIndex),
  }
}

/**
 * Group foreground and background utilities by variants within one attribute.
 */
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
    const group: UtilityGroup = groups.get(key) ?? {
      backgrounds: [],
      foregrounds: [],
      images: [],
      variants: utility.variants,
    }
    const isResolved = resolvedByRange.has(utilityKey(utility))
    if (utility.prefix === 'bg') {
      if (
        isBackgroundImageReset(utility) ||
        isBackgroundImageUtility(utility)
      ) {
        group.images.push(utility)
      } else if (isResolved || !isKnownNonColorBackgroundUtility(utility)) {
        group.backgrounds.push(utility)
      }
    } else if (isResolved || !isKnownNonColorTextUtility(utility)) {
      group.foregrounds.push(utility)
    }
    groups.set(key, group)
  }
  return groups
}

/**
 * Reject dynamic classes and rendering effects whose result is not modeled.
 * Any variant can affect the rendered element, so invalidate the attribute.
 */
function isStaticRenderableClass(text: string): boolean {
  return (
    !/[{}]/u.test(text) &&
    !text
      .split(/\s+/u)
      .some(token =>
        /(?:^|:)!?-?(?:(?:opacity|text-opacity|bg-opacity|filter|backdrop|drop-shadow|blur|brightness|contrast|grayscale|hue-rotate|invert|saturate|sepia|mix-blend|bg-blend|mask)-|(?:filter|grayscale|invert|sepia|hidden|invisible|bg-clip-text)!?$|\[(?:-webkit-)?(?:filter|backdrop-filter|opacity|mix-blend-mode|background-blend-mode):)/u.test(
          token,
        ),
      )
  )
}

/**
 * Honor important utilities, but never infer stylesheet order from HTML order.
 * Undefined means absent; null means conflicting candidates at equal priority.
 */
function selectUnambiguousUtility(
  utilities: readonly TailwindColorUtility[],
): TailwindColorUtility | null | undefined {
  const important = utilities.some(utility => utility.important)
  const candidates = utilities.filter(
    utility => Boolean(utility.important) === important,
  )
  const first = candidates[0]
  return candidates.every(
    utility =>
      utility.kind === first.kind &&
      utility.value === first.value &&
      utility.opacity === first.opacity,
  )
    ? first
    : null
}

/**
 * Recognize text utilities that affect typography rather than color.
 */
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

/**
 * Recognize background utilities for non-color properties.
 */
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

/**
 * Check whether a background utility introduces an image or gradient.
 */
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

/**
 * Check whether a background utility removes the background image.
 */
function isBackgroundImageReset(utility: TailwindColorUtility): boolean {
  return utility.kind === 'named'
    ? utility.value === 'none'
    : /^image:\s*none$/iu.test(normalizeArbitraryValue(utility.value))
}

/**
 * Replace arbitrary-value underscores with spaces and trim the result.
 */
function normalizeArbitraryValue(value: string): string {
  return value.replaceAll('_', ' ').trim()
}

/**
 * Create a lookup key from a utility's source range.
 */
function utilityKey(utility: TailwindColorUtility): string {
  return `${utility.start}:${utility.end}`
}

/**
 * Attach original utility text and offsets to a resolved contrast color.
 */
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
