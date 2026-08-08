import { rgbString } from '../../../shared/color'
import type { ColorMatch, StrategyContext } from '../../detection'
import { resolveAnsiSgrColor } from './parser'

const ANSI_SGR_REGEX =
  // oxlint-disable-next-line eslint/no-control-regex -- Actual ESC characters are a supported ANSI introducer.
  /(?:\\(?:x1b|u001b|u\{1b\}|033|e)|\u001B)\[(?<parameters>[\d:;]{1,128})m/giu

/** Detect ANSI SGR color escape sequences in source text. */
export function findAnsiSgrColors(
  text: string,
  context?: StrategyContext,
): ColorMatch[] {
  const matches: ColorMatch[] = []

  for (const match of text.matchAll(ANSI_SGR_REGEX)) {
    const parameters = match.groups?.parameters
    if (!parameters) {
      continue
    }

    const start = match.index ?? 0
    if (isEscapedSourceIntroducer(text, start)) {
      continue
    }

    const color = resolveAnsiSgrColor(parameters, context?.ansiPalette)
    if (!color) {
      continue
    }

    const [red, green, blue] = color
    matches.push({
      start,
      end: start + match[0].length,
      color: rgbString(red, green, blue),
      editMode: 'read-only',
    })
  }

  return matches
}

function isEscapedSourceIntroducer(text: string, start: number): boolean {
  if (text[start] !== '\\') {
    return false
  }

  let backslashCount = 1
  for (let index = start - 1; index >= 0 && text[index] === '\\'; index--) {
    backslashCount++
  }
  return backslashCount % 2 === 0
}
