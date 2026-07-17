/* oxlint-disable eslint/complexity -- Bounded structural scanners model lexical states explicitly. */
import {
  findColorFunctions,
  findCssVars,
  findHexARGB,
  findHexRGBA,
  findHwb,
  findLessVars,
  findNamedColors,
  findScssVars,
  findStylusVars,
} from '../strategies'
import type { ColorDetector, ColorMatch, StrategyContext } from '../types'
import { parseResolvedColor } from '../utils/color/presentation'
import { parseCssDeclarationValue } from '../utils/css-declaration'
import { evaluateColorContrast } from './evaluate'
import {
  collectStaticMarkupContexts,
  MARKUP_LANGUAGES,
} from './markup-contexts'
import type { MarkupContexts, StaticAttribute } from './markup-contexts'
import type {
  ContrastRange,
  ResolvedContrastColor,
  ResolvedContrastPair,
} from './types'

const STYLE_LANGUAGES = new Set([
  'css',
  'less',
  'sass',
  'scss',
  'styl',
  'stylus',
])

const RENDERING_DEPENDENT_PROPERTIES = new Set([
  'background',
  'background-blend-mode',
  'background-image',
  'filter',
  'mix-blend-mode',
  'opacity',
])

interface CssCandidate extends ContrastRange {
  readonly contextKey: string
  readonly isImportant: boolean
}

interface CssCandidatePair {
  readonly background: CssCandidate
  readonly foreground: CssCandidate
}

interface CssBlockFrame {
  readonly open: number
  parenthesisDepth: number
  readonly segments: ContrastRange[]
  segmentStart: number
}

/** Resolve deterministic CSS declaration pairs from one bounded source. */
export async function findCssContrastPairs(
  text: string,
  context: StrategyContext,
): Promise<ResolvedContrastPair[]> {
  const isStandalone = STYLE_LANGUAGES.has(context.languageId)
  const isMarkup = MARKUP_LANGUAGES.has(context.languageId)
  if (!isStandalone && !isMarkup) {
    return []
  }

  const markup = isMarkup
    ? collectStaticMarkupContexts(text, context.languageId)
    : { attributes: [], styles: [] }
  const candidates: CssCandidatePair[] = []

  if (isStandalone) {
    candidates.push(...collectBlockCandidatePairs(text, 0, text.length, 'css'))
  } else {
    for (const style of markup.styles) {
      candidates.push(
        ...collectBlockCandidatePairs(
          text,
          style.start,
          style.end,
          style.contextPrefix,
        ),
      )
    }
    for (const attribute of markup.attributes) {
      if (
        attribute.name !== 'style' ||
        !isStaticAttributeValue(text, attribute, context.languageId)
      ) {
        continue
      }
      const pair = collectDeclarationPair(
        text,
        attribute.valueStart,
        attribute.valueEnd,
        `inline:${attribute.valueStart}`,
      )
      if (pair) {
        candidates.push(pair)
      }
    }
  }

  if (candidates.length === 0) {
    return []
  }

  const resolutionContext: StrategyContext = isStandalone
    ? context
    : {
        ...context,
        languageId: 'css',
        namedColorMatchMode: 'always',
      }
  const resolutionText = isStandalone
    ? text
    : createEmbeddedCssProjection(text, markup, context.languageId)
  const matches = await runCssDetectorsOnce(resolutionText, resolutionContext)
  const colorsByRange = indexMatchesByRange(matches)

  return candidates.flatMap(candidate => {
    const foreground = resolveCandidate(
      text,
      candidate.foreground,
      colorsByRange,
    )
    const background = resolveCandidate(
      text,
      candidate.background,
      colorsByRange,
    )
    return foreground && background && isDeterminate(foreground, background)
      ? [
          {
            background,
            contextKey: candidate.background.contextKey,
            foreground,
            variantKey: '',
          },
        ]
      : []
  })
}

function createEmbeddedCssProjection(
  text: string,
  markup: MarkupContexts,
  languageId: string,
): string {
  const projection = Array.from({ length: text.length }, () => ' ')
  for (const style of markup.styles) {
    copyProjectionRange(text, projection, style.start, style.end)
  }

  let inlineIndex = 0
  for (const attribute of markup.attributes) {
    if (
      attribute.name !== 'style' ||
      !isStaticAttributeValue(text, attribute, languageId)
    ) {
      continue
    }
    const open = attribute.valueStart - 1
    const selector = `i${inlineIndex.toString(36)}`
    const selectorStart = Math.max(0, open - selector.length)
    for (let index = selectorStart; index < open; index++) {
      projection[index] = selector[index - selectorStart]
    }
    projection[open] = '{'
    copyProjectionRange(
      text,
      projection,
      attribute.valueStart,
      attribute.valueEnd,
    )
    projection[attribute.valueEnd] = '}'
    inlineIndex++
  }
  return projection.join('')
}

function isStaticAttributeValue(
  text: string,
  attribute: StaticAttribute,
  languageId: string,
): boolean {
  const value = text.slice(attribute.valueStart, attribute.valueEnd)
  if (
    ['astro', 'javascriptreact', 'jsx', 'svelte', 'typescriptreact'].includes(
      languageId,
    ) &&
    /[{}]/u.test(value)
  ) {
    return false
  }
  if (languageId === 'vue' && /\{\{|\}\}/u.test(value)) {
    return false
  }

  let quote = ''
  let escaped = false
  let comment = false
  for (let index = attribute.valueStart; index < attribute.valueEnd; index++) {
    const char = text[index]
    const next = text[index + 1] ?? ''
    if (comment) {
      if (char === '*' && next === '/') {
        comment = false
        index++
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '/' && next === '*') {
      comment = true
      index++
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '{' || char === '}') {
      return false
    }
  }
  return true
}

function copyProjectionRange(
  text: string,
  projection: string[],
  start: number,
  end: number,
): void {
  for (let index = start; index < end; index++) {
    projection[index] = text[index]
  }
}

/** Collect quoted static attributes while excluding script and attribute decoys. */
function collectBlockCandidatePairs(
  text: string,
  start: number,
  end: number,
  contextPrefix: string,
): CssCandidatePair[] {
  const pairs: CssCandidatePair[] = []
  const blocks: CssBlockFrame[] = []
  let quote = ''
  let comment = false
  let escaped = false

  for (let index = start; index < end; index++) {
    const char = text[index]
    const next = text[index + 1] ?? ''
    if (comment) {
      if (char === '*' && next === '/') {
        comment = false
        index++
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    const currentBlock = blocks.at(-1)
    if (char === '/' && next === '*') {
      comment = true
      index++
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '(' && currentBlock) {
      currentBlock.parenthesisDepth++
    } else if (char === ')' && currentBlock) {
      currentBlock.parenthesisDepth = Math.max(
        currentBlock.parenthesisDepth - 1,
        0,
      )
    } else if (
      char === ';' &&
      currentBlock &&
      currentBlock.parenthesisDepth === 0
    ) {
      currentBlock.segments.push({
        end: index,
        start: currentBlock.segmentStart,
      })
      currentBlock.segmentStart = index + 1
    } else if (char === '{' && (currentBlock?.parenthesisDepth ?? 0) === 0) {
      blocks.push({
        open: index,
        parenthesisDepth: 0,
        segments: [],
        segmentStart: index + 1,
      })
    } else if (
      char === '}' &&
      currentBlock &&
      currentBlock.parenthesisDepth === 0
    ) {
      const block = blocks.pop()
      if (!block) {
        continue
      }
      block.segments.push({ end: index, start: block.segmentStart })
      const pair = collectCandidatePairFromSegments(
        text,
        block.segments,
        `${contextPrefix}:${block.open}`,
      )
      if (pair) {
        pairs.push(pair)
      }
      const parent = blocks.at(-1)
      if (parent) {
        parent.segmentStart = index + 1
      }
    }
  }

  return pairs.sort(
    (left, right) => left.foreground.start - right.foreground.start,
  )
}

function collectDeclarationPair(
  text: string,
  start: number,
  end: number,
  contextKey: string,
): CssCandidatePair | null {
  const segments: ContrastRange[] = []
  let segmentStart = start
  let quote = ''
  let comment = false
  let escaped = false
  let parenthesisDepth = 0
  let nestedBlockDepth = 0

  const finishSegment = (segmentEnd: number) => {
    segments.push({ end: segmentEnd, start: segmentStart })
  }

  for (let index = start; index <= end; index++) {
    const char = index === end ? ';' : text[index]
    const next = text[index + 1] ?? ''
    if (comment) {
      if (char === '*' && next === '/') {
        comment = false
        index++
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '/' && next === '*') {
      comment = true
      index++
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '(') {
      parenthesisDepth++
    } else if (char === ')') {
      parenthesisDepth = Math.max(parenthesisDepth - 1, 0)
    } else if (char === '{' && parenthesisDepth === 0) {
      nestedBlockDepth++
    } else if (char === '}' && parenthesisDepth === 0) {
      nestedBlockDepth = Math.max(nestedBlockDepth - 1, 0)
      if (nestedBlockDepth === 0) {
        segmentStart = index + 1
      }
    } else if (
      char === ';' &&
      parenthesisDepth === 0 &&
      nestedBlockDepth === 0
    ) {
      finishSegment(index)
      segmentStart = index + 1
    }
  }

  return collectCandidatePairFromSegments(text, segments, contextKey)
}

function collectCandidatePairFromSegments(
  text: string,
  segments: readonly ContrastRange[],
  contextKey: string,
): CssCandidatePair | null {
  let foreground: CssCandidate | undefined
  let background: CssCandidate | undefined
  let isInvalidated = false

  for (const segment of segments) {
    const declaration = parseDeclaration(
      text,
      segment.start,
      segment.end,
      contextKey,
    )
    if (declaration?.property === 'color' && declaration.candidate) {
      foreground = selectCascadingCandidate(foreground, declaration.candidate)
    } else if (
      declaration?.property === 'background-color' &&
      declaration.candidate
    ) {
      background = selectCascadingCandidate(background, declaration.candidate)
    } else if (
      declaration &&
      RENDERING_DEPENDENT_PROPERTIES.has(declaration.property)
    ) {
      isInvalidated = true
    }
  }

  return !isInvalidated && foreground && background
    ? { background, foreground }
    : null
}

/** Select the later candidate unless an existing important value wins. */
function selectCascadingCandidate(
  current: CssCandidate | undefined,
  candidate: CssCandidate,
): CssCandidate {
  if (current?.isImportant && !candidate.isImportant) {
    return current
  }

  return candidate
}

function parseDeclaration(
  text: string,
  start: number,
  end: number,
  contextKey: string,
): {
  readonly candidate?: CssCandidate
  readonly property: string
} | null {
  let colon = -1
  let quote = ''
  let comment = false
  let escaped = false
  let parenthesisDepth = 0

  for (let index = start; index < end; index++) {
    const char = text[index]
    const next = text[index + 1] ?? ''
    if (comment) {
      if (char === '*' && next === '/') {
        comment = false
        index++
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '/' && next === '*') {
      comment = true
      index++
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '(') {
      parenthesisDepth++
    } else if (char === ')') {
      parenthesisDepth = Math.max(parenthesisDepth - 1, 0)
    } else if (char === ':' && parenthesisDepth === 0) {
      colon = index
      break
    }
  }
  if (colon === -1) {
    return null
  }

  const property = text
    .slice(start, colon)
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .trim()
    .toLowerCase()
  if (property !== 'color' && property !== 'background-color') {
    return property ? { property } : null
  }

  let valueStart = colon + 1
  let valueEnd = end
  while (valueStart < valueEnd && /\s/u.test(text[valueStart])) {
    valueStart++
  }
  while (valueEnd > valueStart && /\s/u.test(text[valueEnd - 1])) {
    valueEnd--
  }
  const parsedValue = parseCssDeclarationValue(text.slice(valueStart, valueEnd))
  valueEnd = valueStart + parsedValue.value.length
  if (valueStart >= valueEnd) {
    return null
  }

  return {
    candidate: {
      contextKey,
      end: valueEnd,
      isImportant: parsedValue.isImportant,
      start: valueStart,
    },
    property,
  }
}

async function runCssDetectorsOnce(
  text: string,
  context: StrategyContext,
): Promise<ColorMatch[]> {
  if (context.signal?.isCancellationRequested) {
    return []
  }
  const detectors: ColorDetector[] = [
    context.useARGB ? findHexARGB : findHexRGBA,
    findColorFunctions,
    findHwb,
  ]
  if (context.namedColorMatchMode !== 'never') {
    detectors.push(findNamedColors)
  }
  if (['css', 'less', 'scss'].includes(context.languageId)) {
    detectors.push(findCssVars)
  }
  if (context.languageId === 'less') {
    detectors.push(findLessVars)
  } else if (context.languageId === 'scss') {
    detectors.push(findScssVars)
  } else if (context.languageId === 'styl' || context.languageId === 'stylus') {
    detectors.push(findStylusVars)
  }

  const namedColorText = createNamedColorProjection(text)

  if (context.signal) {
    const matches: ColorMatch[] = []
    for (const detector of detectors) {
      if (context.signal.isCancellationRequested) {
        return []
      }
      try {
        const result = await detector(
          detector === findNamedColors ? namedColorText : text,
          context,
        )
        if (context.signal.isCancellationRequested) {
          return []
        }
        matches.push(...result)
      } catch {
        if (context.signal.isCancellationRequested) {
          return []
        }
      }
    }
    return matches
  }

  const results = await Promise.all(
    detectors.map(async detector => {
      try {
        return await detector(
          detector === findNamedColors ? namedColorText : text,
          context,
        )
      } catch {
        return []
      }
    }),
  )
  return results.flat()
}

function createNamedColorProjection(text: string): string {
  // oxlint-disable-next-line unicorn/prefer-spread -- Spread collapses UTF-16 surrogate pairs and shifts source offsets.
  const projection = text.split('')
  let quote = ''
  let escaped = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    const next = text[index + 1] ?? ''
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    const isBlockComment = char === '/' && next === '*'
    const isLineComment = char === '/' && next === '/'
    if (!isBlockComment && !isLineComment) {
      continue
    }

    const close = isBlockComment
      ? text.indexOf('*/', index + 2)
      : findLineEnd(text, index + 2)
    const end = close === -1 ? text.length : close + (isBlockComment ? 2 : 0)
    for (; index < end; index++) {
      if (text[index] !== '\n' && text[index] !== '\r') {
        projection[index] = ' '
      }
    }
    index--
  }
  return projection.join('')
}

function findLineEnd(text: string, start: number): number {
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\n' || text[index] === '\r') {
      return index
    }
  }
  return -1
}

function indexMatchesByRange(
  matches: readonly ColorMatch[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const indexed = new Map<string, Set<string>>()
  for (const match of matches) {
    const key = `${match.start}:${match.end}`
    const colors = indexed.get(key) ?? new Set<string>()
    colors.add(match.color)
    indexed.set(key, colors)
  }
  return indexed
}

function resolveCandidate(
  text: string,
  candidate: CssCandidate,
  colorsByRange: ReadonlyMap<string, ReadonlySet<string>>,
): ResolvedContrastColor | null {
  const colors = colorsByRange.get(`${candidate.start}:${candidate.end}`)
  if (colors?.size !== 1) {
    return null
  }
  const color = colors.values().next().value
  return color
    ? {
        color,
        originalText: text.slice(candidate.start, candidate.end),
        range: { end: candidate.end, start: candidate.start },
      }
    : null
}

function isDeterminate(
  foreground: ResolvedContrastColor,
  background: ResolvedContrastColor,
): boolean {
  const parsedForeground = parseResolvedColor(foreground.color)
  const parsedBackground = parseResolvedColor(background.color)
  return Boolean(
    parsedForeground &&
    parsedBackground &&
    evaluateColorContrast(parsedForeground, parsedBackground).kind ===
      'determinate',
  )
}
