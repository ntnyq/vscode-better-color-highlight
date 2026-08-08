const DART_COLOR_CONSTRUCTOR_HEAD_REGEX =
  /(?<prefix>^|[^\w.])(?<head>Color(?:\.fromARGB|\.fromRGBO|\.from)?\s*\()/gu

export interface DartColorConstructorRange {
  readonly end: number
  readonly head: string
  readonly openParenthesis: number
  readonly start: number
}

interface DartColorConstructorCandidate {
  readonly head: string
  readonly openParenthesis: number
  readonly start: number
}

/** Find balanced Dart color constructor ranges with one structural scan. */
export function findDartColorConstructorRanges(
  text: string,
): DartColorConstructorRange[] {
  const candidates = findDartColorConstructorCandidates(text)
  if (candidates.length === 0) {
    return []
  }

  const candidatesByOpenParenthesis = new Map(
    candidates.map(candidate => [candidate.openParenthesis, candidate]),
  )
  const endsByOpenParenthesis = new Map<number, number>()
  const codeCandidateOpenParentheses = new Set<number>()
  const openParentheses: number[] = []
  let index = 0

  while (index < text.length) {
    const triviaEnd = skipDartTrivia(text, index)
    if (triviaEnd > index) {
      index = triviaEnd
      continue
    }

    const stringEnd = findDartStringEnd(text, index)
    if (stringEnd !== null) {
      index = stringEnd
      continue
    }

    const character = text[index]
    if (character === '(') {
      openParentheses.push(index)
      if (candidatesByOpenParenthesis.has(index)) {
        codeCandidateOpenParentheses.add(index)
      }
    } else if (character === ')') {
      const openParenthesis = openParentheses.pop()
      if (
        openParenthesis !== undefined &&
        candidatesByOpenParenthesis.has(openParenthesis)
      ) {
        endsByOpenParenthesis.set(openParenthesis, index + 1)
      }
    }
    index++
  }

  const unscopedCandidates = new Set(
    candidates
      .filter(
        candidate =>
          !codeCandidateOpenParentheses.has(candidate.openParenthesis),
      )
      .map(candidate => candidate.openParenthesis),
  )
  if (unscopedCandidates.size > 0) {
    findUnscopedParenthesisEnds(text, unscopedCandidates, endsByOpenParenthesis)
  }

  return candidates.flatMap(candidate => {
    const end = endsByOpenParenthesis.get(candidate.openParenthesis)
    return end === undefined ? [] : [{ ...candidate, end }]
  })
}

function findUnscopedParenthesisEnds(
  text: string,
  candidates: ReadonlySet<number>,
  endsByOpenParenthesis: Map<number, number>,
): void {
  const openParentheses: number[] = []

  for (let index = 0; index < text.length; index++) {
    if (text[index] === '(') {
      openParentheses.push(index)
      continue
    }
    if (text[index] !== ')') {
      continue
    }

    const openParenthesis = openParentheses.pop()
    if (openParenthesis !== undefined && candidates.has(openParenthesis)) {
      endsByOpenParenthesis.set(openParenthesis, index + 1)
    }
  }
}

/** Skip Dart whitespace and comments, including nested block comments. */
export function skipDartTrivia(text: string, start: number): number {
  let index = start

  while (index < text.length) {
    if (/\s/u.test(text[index])) {
      index++
      continue
    }

    const commentEnd = findDartCommentEnd(text, index)
    if (commentEnd === null) {
      break
    }
    index = commentEnd
  }

  return index
}

/** Remove Dart comments while preserving separation between adjacent tokens. */
export function stripDartComments(text: string): string {
  let result = ''
  let index = 0

  while (index < text.length) {
    const commentEnd = findDartCommentEnd(text, index)
    if (commentEnd === null) {
      result += text[index]
      index++
      continue
    }

    result += ' '
    index = commentEnd
  }

  return result
}

function findDartColorConstructorCandidates(
  text: string,
): DartColorConstructorCandidate[] {
  const candidates: DartColorConstructorCandidate[] = []

  for (const match of text.matchAll(DART_COLOR_CONSTRUCTOR_HEAD_REGEX)) {
    const prefix = match.groups?.prefix ?? ''
    const head = match.groups?.head
    if (!head) {
      continue
    }

    const start = (match.index ?? 0) + prefix.length
    candidates.push({
      start,
      head,
      openParenthesis: start + head.lastIndexOf('('),
    })
  }

  return candidates
}

function findDartCommentEnd(text: string, start: number): number | null {
  if (text[start] !== '/') {
    return null
  }

  if (text[start + 1] === '/') {
    let index = start + 2
    while (
      index < text.length &&
      text[index] !== '\n' &&
      text[index] !== '\r'
    ) {
      index++
    }
    return index
  }

  if (text[start + 1] !== '*') {
    return null
  }

  let index = start + 2
  let depth = 1
  while (index < text.length && depth > 0) {
    if (text[index] === '/' && text[index + 1] === '*') {
      depth++
      index += 2
    } else if (text[index] === '*' && text[index + 1] === '/') {
      depth--
      index += 2
    } else {
      index++
    }
  }
  return index
}

function findDartStringEnd(text: string, start: number): number | null {
  const quote = text[start]
  if (quote !== "'" && quote !== '"') {
    return null
  }

  const delimiter = text.startsWith(quote.repeat(3), start)
    ? quote.repeat(3)
    : quote
  const rawPrefix = text[start - 1]
  const isRaw =
    (rawPrefix === 'r' || rawPrefix === 'R') &&
    (start < 2 || !/\w/u.test(text[start - 2]))
  let index = start + delimiter.length

  while (index < text.length) {
    if (!isRaw && text[index] === '\\') {
      index += 2
      continue
    }
    if (text.startsWith(delimiter, index)) {
      return index + delimiter.length
    }
    if (
      delimiter.length === 1 &&
      (text[index] === '\n' || text[index] === '\r')
    ) {
      return index
    }
    index++
  }

  return text.length
}
