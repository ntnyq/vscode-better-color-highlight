# CSS Variable Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build optional, conservative cross-file CSS custom property resolution for `var(--name)` color highlights.

**Architecture:** Keep the existing `findCssVars` strategy as the public entry point, but split reusable logic into focused parser, resolver, and source-loading helpers. The feature is gated by configuration, uses trusted selectors for cross-file declarations, and falls back to no highlight when resolution is ambiguous.

**Tech Stack:** TypeScript, reactive-vscode config, VS Code workspace FS APIs, Vitest, tsdown, vscode-ext-gen, pnpm.

---

## File Structure

- Modify `package.json`
  - Add `resolveCssVariablesAcrossFiles`, `cssVariablePaths`, and
    `cssVariableTrustedSelectors` settings.
- Regenerate `src/meta.ts`
  - Produced by `rtk pnpm generate:meta`; do not edit manually.
- Modify `src/types/highlight-run.ts`
  - Add the new settings to `HighlightRunConfig` and `StrategyRunOptions`.
- Modify `src/types/color-highlight.ts`
  - Add CSS variable resolver fields to `StrategyContext`.
- Modify `src/composables/use-color-highlight.ts`
  - Include the new settings in highlight run signatures and strategy context.
- Create `src/strategies/css-var-parser.ts`
  - Parse custom property declarations, `var()` usages, trusted selector status,
    normalized selectors, and simple selector specificity.
- Create `src/strategies/css-var-resolver.ts`
  - Resolve direct colors, nested variables, fallbacks, cycles, ambiguity, and
    trusted-candidate ordering.
- Create `src/strategies/css-var-sources.ts`
  - Load configured external CSS variable sources with workspace FS helpers,
    caching, limits, and file/directory/glob expansion.
- Modify `src/strategies/css-vars.ts`
  - Use the parser/resolver helpers for current-file behavior and optionally
    merge external sources when enabled.
- Modify `src/utils/workspace-file-system.ts`
  - Add helpers for workspace folder resolution, directory reads, directory
    detection, and file discovery needed by CSS variable source loading.
- Modify `tests/use-color-highlight.test.ts`
  - Assert the new settings are part of the run signature and strategy context.
- Modify `tests/css-vars.test.ts`
  - Add pure current-file and cross-file resolver tests.
- Create or modify `tests/css-vars-cache.test.ts`
  - Cover external file cache invalidation and read-failure behavior.
- Modify `README.md`
  - Document the new settings and conservative resolver behavior.

## Scope Check

The spec is one subsystem: CSS custom property resolution for color highlights.
It touches configuration, strategy context, resolver internals, and tests, but
the result is one working feature behind one opt-in flag.

## Task 1: Configuration And Strategy Context

**Files:**

- Modify: `package.json`
- Generated: `src/meta.ts`
- Modify: `src/types/highlight-run.ts`
- Modify: `src/types/color-highlight.ts`
- Modify: `src/composables/use-color-highlight.ts`
- Test: `tests/use-color-highlight.test.ts`

- [ ] **Step 1: Write the failing context plumbing test**

Add this test to `tests/use-color-highlight.test.ts` inside the existing
`describe(useColorHighlight...)` block, near the other strategy invocation tests:

```ts
it('passes CSS variable resolver settings to strategies', async () => {
  documentTextRef = createRef('.box { color: var(--brand); }')
  configSnapshot.resolveCssVariablesAcrossFiles = true
  configSnapshot.cssVariablePaths = ['src/styles/tokens.css']
  configSnapshot.cssVariableTrustedSelectors = [':root', '[data-theme=light]']

  vi.isolateModules(async () => {
    const { useColorHighlight } =
      await import('../src/composables/use-color-highlight')
    useColorHighlight()
  })

  await flushPromises()

  expect(asyncStrategy).toHaveBeenCalledWith(
    '.box { color: var(--brand); }',
    expect.objectContaining({
      resolveCssVariablesAcrossFiles: true,
      cssVariablePaths: ['src/styles/tokens.css'],
      cssVariableTrustedSelectors: [':root', '[data-theme=light]'],
    }),
  )
})
```

If the test file does not expose `flushPromises`, add this helper near the other
local helpers:

```ts
async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm test tests/use-color-highlight.test.ts
```

Expected: FAIL because `resolveCssVariablesAcrossFiles`,
`cssVariablePaths`, and `cssVariableTrustedSelectors` are not part of the
generated config types or strategy context yet.

- [ ] **Step 3: Add configuration schema**

In `package.json`, add these properties after
`color-highlight.scssLoadPaths`:

```json
"color-highlight.resolveCssVariablesAcrossFiles": {
  "type": "boolean",
  "default": false,
  "description": "Resolve CSS custom properties from configured CSS variable source paths. Disabled by default to avoid extra file-system work and ambiguous cascade guesses."
},
"color-highlight.cssVariablePaths": {
  "type": "array",
  "default": [],
  "items": {
    "type": "string"
  },
  "description": "File, directory, or glob paths used as external CSS custom property sources when CSS variable resolution is enabled."
},
"color-highlight.cssVariableTrustedSelectors": {
  "type": "array",
  "default": [
    ":root",
    "html",
    "body",
    ":host"
  ],
  "items": {
    "type": "string"
  },
  "description": "Selectors whose custom property declarations are trusted for cross-file CSS variable color resolution."
},
```

- [ ] **Step 4: Regenerate extension metadata**

Run:

```bash
rtk pnpm generate:meta
```

Expected: `src/meta.ts` gains the new config keys and shorthand fields.

- [ ] **Step 5: Add new settings to highlight run types**

In `src/types/highlight-run.ts`, add these fields to the `Pick` in
`HighlightRunConfig` immediately after the SCSS fields:

```ts
  | 'resolveCssVariablesAcrossFiles'
  | 'cssVariablePaths'
  | 'cssVariableTrustedSelectors'
```

Then add these fields to `StrategyRunOptions` after `scssLoadPaths`:

```ts
  /**
   * Whether CSS custom properties may be resolved from configured files.
   */
  readonly resolveCssVariablesAcrossFiles: HighlightRunConfig['resolveCssVariablesAcrossFiles']

  /**
   * File, directory, or glob paths used as CSS custom property sources.
   */
  readonly cssVariablePaths: HighlightRunConfig['cssVariablePaths']

  /**
   * Selectors trusted for cross-file CSS custom property resolution.
   */
  readonly cssVariableTrustedSelectors: HighlightRunConfig['cssVariableTrustedSelectors']
```

- [ ] **Step 6: Add new settings to strategy context**

In `src/types/color-highlight.ts`, add these fields to `StrategyContext` after
`scssLoadPaths`:

```ts
  /**
   * Whether CSS custom properties may be resolved from configured files.
   */
  resolveCssVariablesAcrossFiles?: boolean

  /**
   * File, directory, or glob paths used as CSS custom property sources.
   */
  cssVariablePaths?: string[]

  /**
   * Selectors trusted for cross-file CSS custom property resolution.
   */
  cssVariableTrustedSelectors?: string[]
```

- [ ] **Step 7: Wire settings into highlight signatures and strategy calls**

In `src/composables/use-color-highlight.ts`, update
`createHighlightRunSignature` to include:

```ts
    resolveCssVariablesAcrossFiles:
      highlightConfig.resolveCssVariablesAcrossFiles,
    cssVariablePaths: highlightConfig.cssVariablePaths,
    cssVariableTrustedSelectors: highlightConfig.cssVariableTrustedSelectors,
```

Update the destructuring in `runStrategies`:

```ts
    resolveCssVariablesAcrossFiles,
    cssVariablePaths,
    cssVariableTrustedSelectors,
```

Pass these fields into each strategy context:

```ts
        resolveCssVariablesAcrossFiles,
        cssVariablePaths,
        cssVariableTrustedSelectors,
```

Pass these fields when calling `runStrategies` in `setupEditorTracking`:

```ts
          resolveCssVariablesAcrossFiles:
            config.resolveCssVariablesAcrossFiles,
          cssVariablePaths: config.cssVariablePaths,
          cssVariableTrustedSelectors: config.cssVariableTrustedSelectors,
```

- [ ] **Step 8: Run the context test**

Run:

```bash
rtk pnpm test tests/use-color-highlight.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
rtk git add package.json src/meta.ts src/types/highlight-run.ts src/types/color-highlight.ts src/composables/use-color-highlight.ts tests/use-color-highlight.test.ts
rtk git commit -m "feat: add css variable resolver settings"
```

## Task 2: Pure CSS Variable Parser

**Files:**

- Create: `src/strategies/css-var-parser.ts`
- Modify: `src/strategies/css-vars.ts`
- Test: `tests/css-vars.test.ts`

- [ ] **Step 1: Write parser-focused tests**

Add these imports to `tests/css-vars.test.ts`:

```ts
import {
  collectCssVarDeclarations,
  getCssSelectorSpecificity,
  isTrustedCssVarSelector,
} from '../src/strategies/css-var-parser'
```

Add these tests near the top of the suite:

```ts
it('marks default trusted selectors as trusted', () => {
  const declarations = collectCssVarDeclarations(
    ':root { --brand: #0ea5e9; } [data-theme=dark] { --brand: white; }',
    {
      filePath: '/workspace/src/app.css',
      trustedSelectors: [':root', 'html', 'body', ':host'],
    },
  )

  expect(declarations).toHaveLength(2)
  expect(declarations[0]).toMatchObject({
    name: '--brand',
    value: '#0ea5e9',
    selector: ':root',
    isTrusted: true,
  })
  expect(declarations[1]).toMatchObject({
    name: '--brand',
    value: 'white',
    selector: '[data-theme=dark]',
    isTrusted: false,
  })
})

it('requires every comma selector item to be trusted', () => {
  expect(isTrustedCssVarSelector(':root, html', [':root', 'html'])).toBe(true)
  expect(
    isTrustedCssVarSelector(':root, [data-theme=dark]', [':root', 'html']),
  ).toBe(false)
})

it('normalizes selector whitespace before trusted selector matching', () => {
  expect(
    isTrustedCssVarSelector('html   [data-theme=light]', [
      'html [data-theme=light]',
    ]),
  ).toBe(true)
})

it('computes simple selector specificity for trusted candidate ordering', () => {
  expect(getCssSelectorSpecificity(':root')).toStrictEqual([0, 1, 0])
  expect(getCssSelectorSpecificity('html')).toStrictEqual([0, 0, 1])
  expect(getCssSelectorSpecificity('html[data-theme=light]')).toStrictEqual([
    0, 1, 1,
  ])
})
```

- [ ] **Step 2: Run the failing parser tests**

Run:

```bash
rtk pnpm test tests/css-vars.test.ts
```

Expected: FAIL because `src/strategies/css-var-parser.ts` does not exist.

- [ ] **Step 3: Create the parser module**

Create `src/strategies/css-var-parser.ts` with:

```ts
export interface CssVarDeclaration {
  readonly name: string
  readonly value: string
  readonly selector: string
  readonly normalizedSelector: string
  readonly specificity: readonly [number, number, number]
  readonly sourceOrder: number
  readonly filePath?: string
  readonly isTrusted: boolean
}

export interface CollectCssVarDeclarationOptions {
  readonly filePath?: string
  readonly trustedSelectors: readonly string[]
  readonly sourceOrderOffset?: number
}

const CSS_RULE_REGEX =
  /(?<selector>[^{}]+)\{(?<body>[^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gu

const CSS_VAR_DEF_REGEX = /(?<name>--[-\w]+)\s*:\s*(?<value>[^;]+?)\s*;/gu

export function normalizeCssSelector(selector: string): string {
  return selector.replaceAll(/\s+/gu, ' ').trim()
}

export function splitCssSelectorList(selector: string): string[] {
  return selector
    .split(',')
    .map(item => normalizeCssSelector(item))
    .filter(Boolean)
}

export function isTrustedCssVarSelector(
  selector: string,
  trustedSelectors: readonly string[],
): boolean {
  const trusted = new Set(trustedSelectors.map(normalizeCssSelector))
  const items = splitCssSelectorList(selector)
  return items.length > 0 && items.every(item => trusted.has(item))
}

export function getCssSelectorSpecificity(
  selector: string,
): readonly [number, number, number] {
  const normalized = normalizeCssSelector(selector)
  const idCount = (normalized.match(/#[\w-]+/gu) ?? []).length
  const classLikeCount = (
    normalized.match(/(?:\.[\w-]+|\[[^\]]+\]|:[\w-]+)/gu) ?? []
  ).length
  const withoutClassLike = normalized
    .replaceAll(/#[\w-]+/gu, ' ')
    .replaceAll(/(?:\.[\w-]+|\[[^\]]+\]|:[\w-]+)/gu, ' ')
  const typeCount = (withoutClassLike.match(/\b[a-zA-Z][\w-]*\b/gu) ?? [])
    .length

  return [idCount, classLikeCount, typeCount]
}

export function compareCssSpecificity(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < 3; index++) {
    const diff = left[index] - right[index]
    if (diff !== 0) return diff
  }
  return 0
}

export function collectCssVarDeclarations(
  text: string,
  options: CollectCssVarDeclarationOptions,
): CssVarDeclaration[] {
  const declarations: CssVarDeclaration[] = []
  let sourceOrder = options.sourceOrderOffset ?? 0

  for (const rule of text.matchAll(CSS_RULE_REGEX)) {
    const selector = rule.groups?.selector
    const body = rule.groups?.body
    if (!selector || !body) continue

    const normalizedSelector = normalizeCssSelector(selector)
    const isTrusted = isTrustedCssVarSelector(
      normalizedSelector,
      options.trustedSelectors,
    )
    const specificity = getCssSelectorSpecificity(normalizedSelector)

    for (const declaration of body.matchAll(CSS_VAR_DEF_REGEX)) {
      const name = declaration.groups?.name
      const value = declaration.groups?.value?.trim()
      if (!name || !value) continue

      declarations.push({
        name,
        value,
        selector,
        normalizedSelector,
        specificity,
        sourceOrder,
        filePath: options.filePath,
        isTrusted,
      })
      sourceOrder++
    }
  }

  for (const declaration of text.matchAll(CSS_VAR_DEF_REGEX)) {
    const index = declaration.index ?? 0
    const before = text.lastIndexOf('{', index)
    const after = text.lastIndexOf('}', index)
    if (before > after) continue

    const name = declaration.groups?.name
    const value = declaration.groups?.value?.trim()
    if (!name || !value) continue

    declarations.push({
      name,
      value,
      selector: ':root',
      normalizedSelector: ':root',
      specificity: [0, 1, 0],
      sourceOrder,
      filePath: options.filePath,
      isTrusted: isTrustedCssVarSelector(':root', options.trustedSelectors),
    })
    sourceOrder++
  }

  return declarations
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
rtk pnpm test tests/css-vars.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add src/strategies/css-var-parser.ts tests/css-vars.test.ts
rtk git commit -m "feat: parse css variable declarations"
```

## Task 3: Resolver With Trusted Candidate Ordering

**Files:**

- Create: `src/strategies/css-var-resolver.ts`
- Modify: `src/strategies/css-vars.ts`
- Test: `tests/css-vars.test.ts`

- [ ] **Step 1: Write resolver behavior tests**

Add this import to `tests/css-vars.test.ts`:

```ts
import { resolveCssVarMatches } from '../src/strategies/css-var-resolver'
```

Add these tests:

```ts
it('resolves external trusted declarations when cross-file data is provided', async () => {
  const text = '.button { color: var(--brand); }'
  const result = await resolveCssVarMatches(text, {
    currentDeclarations: [],
    externalDeclarations: [
      {
        name: '--brand',
        value: '#0ea5e9',
        selector: ':root',
        normalizedSelector: ':root',
        specificity: [0, 1, 0],
        sourceOrder: 0,
        filePath: '/workspace/tokens.css',
        isTrusted: true,
      },
    ],
  })

  expect(result).toStrictEqual([
    {
      start: text.indexOf('var(--brand)'),
      end: text.indexOf('var(--brand)') + 'var(--brand)'.length,
      color: 'rgb(14, 165, 233)',
    },
  ])
})

it('uses fallback when an external variable is missing', async () => {
  const text = '.button { color: var(--missing, #ff0000); }'
  const result = await resolveCssVarMatches(text, {
    currentDeclarations: [],
    externalDeclarations: [],
  })

  expect(result[0].color).toBe('rgb(255, 0, 0)')
})

it('skips cyclic CSS variable references', async () => {
  const text = `
    :root {
      --a: var(--b);
      --b: var(--a);
    }
    .button { color: var(--a); }
  `
  const declarations = collectCssVarDeclarations(text, {
    trustedSelectors: [':root'],
  })

  const result = await resolveCssVarMatches(text, {
    currentDeclarations: declarations,
    externalDeclarations: [],
  })

  expect(result).toStrictEqual([])
})

it('treats external untrusted same-name declarations as ambiguous', async () => {
  const text = '.button { color: var(--brand); }'
  const result = await resolveCssVarMatches(text, {
    currentDeclarations: [],
    externalDeclarations: [
      {
        name: '--brand',
        value: '#0ea5e9',
        selector: ':root',
        normalizedSelector: ':root',
        specificity: [0, 1, 0],
        sourceOrder: 0,
        filePath: '/workspace/tokens.css',
        isTrusted: true,
      },
      {
        name: '--brand',
        value: '#ffffff',
        selector: '[data-theme=dark]',
        normalizedSelector: '[data-theme=dark]',
        specificity: [0, 1, 0],
        sourceOrder: 1,
        filePath: '/workspace/tokens.css',
        isTrusted: false,
      },
    ],
  })

  expect(result).toStrictEqual([])
})
```

- [ ] **Step 2: Run the failing resolver tests**

Run:

```bash
rtk pnpm test tests/css-vars.test.ts
```

Expected: FAIL because `css-var-resolver.ts` does not exist.

- [ ] **Step 3: Create the resolver module**

Create `src/strategies/css-var-resolver.ts` with:

```ts
import type { ColorDetector, ColorMatch } from '../types'
import { compareCssSpecificity, type CssVarDeclaration } from './css-var-parser'
import { findColorFunctions, resolveShorthandColor } from './color-functions'
import { findHexRGBA } from './hex'
import { findHwb } from './hwb'
import { findNamedColors } from './named-colors'

const CSS_VAR_REF_REGEX =
  /var\(\s*(?<name>--[-\w]+)\s*(?:,\s*(?<fallback>[^)]*?))?\s*\)/gu

const MAX_CSS_VAR_RESOLVE_DEPTH = 16

export interface ResolveCssVarMatchesOptions {
  readonly currentDeclarations: readonly CssVarDeclaration[]
  readonly externalDeclarations: readonly CssVarDeclaration[]
}

interface ResolvedCandidate {
  readonly declaration: CssVarDeclaration
  readonly isExternal: boolean
}

async function resolveDirectColor(value: string): Promise<string | null> {
  const strategies: ColorDetector[] = [
    findHexRGBA,
    findColorFunctions,
    findHwb,
    findNamedColors,
  ]

  const results = await Promise.all(strategies.map(fn => fn(value)))
  const allMatches = results.flat()
  return allMatches.length > 0 ? allMatches[0].color : null
}

function getBestCandidate(
  name: string,
  options: ResolveCssVarMatchesOptions,
): ResolvedCandidate | null {
  const currentCandidates = options.currentDeclarations.filter(
    declaration => declaration.name === name,
  )
  if (currentCandidates.length > 0) {
    return {
      declaration: currentCandidates[currentCandidates.length - 1],
      isExternal: false,
    }
  }

  const externalCandidates = options.externalDeclarations.filter(
    declaration => declaration.name === name,
  )
  if (externalCandidates.some(declaration => !declaration.isTrusted)) {
    return null
  }

  const trusted = externalCandidates.filter(
    declaration => declaration.isTrusted,
  )
  if (trusted.length === 0) return null

  const sorted = [...trusted].sort((left, right) => {
    const specificityDiff = compareCssSpecificity(
      left.specificity,
      right.specificity,
    )
    if (specificityDiff !== 0) return specificityDiff
    return left.sourceOrder - right.sourceOrder
  })

  return {
    declaration: sorted[sorted.length - 1],
    isExternal: true,
  }
}

async function resolveCssVarValue(
  value: string,
  nameHint: string | undefined,
  options: ResolveCssVarMatchesOptions,
  seen: Set<string>,
  depth: number,
): Promise<string | null> {
  if (depth > MAX_CSS_VAR_RESOLVE_DEPTH) return null

  const normalized = value.replaceAll(/!important\b/gu, '').trim()
  const directColor = await resolveDirectColor(normalized)
  if (directColor) return directColor

  const shorthandColor = resolveShorthandColor(normalized, nameHint)
  if (shorthandColor) return shorthandColor

  for (const match of normalized.matchAll(CSS_VAR_REF_REGEX)) {
    const refName = match.groups?.name
    if (!refName || seen.has(refName)) continue

    const candidate = getBestCandidate(refName, options)
    if (candidate) {
      const resolved = await resolveCssVarValue(
        candidate.declaration.value,
        refName,
        options,
        new Set([...seen, refName]),
        depth + 1,
      )
      if (resolved) return resolved
    }

    const fallback = match.groups?.fallback?.trim()
    if (fallback) {
      const fallbackColor = await resolveCssVarValue(
        fallback,
        nameHint,
        options,
        seen,
        depth + 1,
      )
      if (fallbackColor) return fallbackColor
    }
  }

  return null
}

export async function resolveCssVarMatches(
  text: string,
  options: ResolveCssVarMatchesOptions,
): Promise<ColorMatch[]> {
  const matches: ColorMatch[] = []

  for (const match of text.matchAll(CSS_VAR_REF_REGEX)) {
    const name = match.groups?.name
    const fullMatch = match[0]
    if (!name) continue

    const candidate = getBestCandidate(name, options)
    let color: string | null = null
    if (candidate) {
      color = await resolveCssVarValue(
        candidate.declaration.value,
        name,
        options,
        new Set([name]),
        0,
      )
    }

    const fallback = match.groups?.fallback?.trim()
    if (!color && fallback) {
      color = await resolveCssVarValue(
        fallback,
        name,
        options,
        new Set([name]),
        0,
      )
    }

    if (!color) continue

    const start = match.index ?? 0
    matches.push({
      start,
      end: start + fullMatch.length,
      color,
    })
  }

  return matches
}
```

- [ ] **Step 4: Route existing `findCssVars` through parser and resolver**

Replace the implementation body of `findCssVars` in
`src/strategies/css-vars.ts` with:

```ts
export async function findCssVars(
  text: string,
  context?: StrategyContext,
): Promise<ColorMatch[]> {
  const trustedSelectors = context?.cssVariableTrustedSelectors ?? [
    ':root',
    'html',
    'body',
    ':host',
  ]
  const currentDeclarations = collectCssVarDeclarations(text, {
    filePath: context?.filePath,
    trustedSelectors,
  })

  return resolveCssVarMatches(text, {
    currentDeclarations,
    externalDeclarations: [],
  })
}
```

Then replace the old local resolver imports with:

```ts
import type { ColorMatch, StrategyContext } from '../types'
import { collectCssVarDeclarations } from './css-var-parser'
import { resolveCssVarMatches } from './css-var-resolver'
```

- [ ] **Step 5: Run CSS variable tests**

Run:

```bash
rtk pnpm test tests/css-vars.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
rtk git add src/strategies/css-var-resolver.ts src/strategies/css-vars.ts tests/css-vars.test.ts
rtk git commit -m "feat: resolve css variable colors conservatively"
```

## Task 4: Workspace Source Loading And Caching

**Files:**

- Modify: `src/utils/workspace-file-system.ts`
- Create: `src/strategies/css-var-sources.ts`
- Test: `tests/css-vars-cache.test.ts`

- [ ] **Step 1: Write external source loading tests**

Create `tests/css-vars-cache.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileTexts = new Map<string, string>()
const fileStats = new Map<string, { mtimeMs: number; size: number }>()
const fileExists = new Set<string>()
const directories = new Map<string, string[]>()
const readCalls: string[] = []

vi.mock(import('../src/utils/workspace-file-system'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    findWorkspaceFiles: vi.fn(async (pathPattern: string) =>
      pathPattern.includes('*')
        ? [...fileExists].filter(filePath => filePath.endsWith('.css'))
        : [pathPattern],
    ),
    readWorkspaceFile: vi.fn(async (filePath: string) => {
      readCalls.push(filePath)
      const text = fileTexts.get(filePath)
      if (text === undefined) throw new Error(`Missing ${filePath}`)
      return text
    }),
    readWorkspaceDirectory: vi.fn(async (dirPath: string) =>
      (directories.get(dirPath) ?? []).map(name => [name, 0] as const),
    ),
    statWorkspaceFile: vi.fn(async (filePath: string) => {
      const stats = fileStats.get(filePath)
      if (!stats) throw new Error(`Missing stats ${filePath}`)
      return stats
    }),
    workspacePathExists: vi.fn(async (filePath: string) =>
      fileExists.has(filePath),
    ),
    workspacePathIsDirectory: vi.fn(async (filePath: string) =>
      directories.has(filePath),
    ),
  }
})

describe('CSS variable external source cache', () => {
  beforeEach(() => {
    vi.resetModules()
    fileTexts.clear()
    fileStats.clear()
    fileExists.clear()
    directories.clear()
    readCalls.length = 0
  })

  it('loads declarations from configured external paths', async () => {
    fileExists.add('/workspace/tokens.css')
    fileTexts.set('/workspace/tokens.css', ':root { --brand: #0ea5e9; }')
    fileStats.set('/workspace/tokens.css', { mtimeMs: 1, size: 29 })

    const { loadCssVarSourceDeclarations } =
      await import('../src/strategies/css-var-sources')
    const declarations = await loadCssVarSourceDeclarations({
      currentFilePath: '/workspace/src/app.css',
      cssVariablePaths: ['/workspace/tokens.css'],
      trustedSelectors: [':root'],
      debug: false,
    })

    expect(declarations).toHaveLength(1)
    expect(declarations[0]).toMatchObject({
      name: '--brand',
      value: '#0ea5e9',
      isTrusted: true,
    })
  })

  it('reuses cached file text until mtime or size changes', async () => {
    fileExists.add('/workspace/tokens.css')
    fileTexts.set('/workspace/tokens.css', ':root { --brand: #0ea5e9; }')
    fileStats.set('/workspace/tokens.css', { mtimeMs: 1, size: 29 })

    const { loadCssVarSourceDeclarations } =
      await import('../src/strategies/css-var-sources')
    await loadCssVarSourceDeclarations({
      currentFilePath: '/workspace/src/app.css',
      cssVariablePaths: ['/workspace/tokens.css'],
      trustedSelectors: [':root'],
      debug: false,
    })
    await loadCssVarSourceDeclarations({
      currentFilePath: '/workspace/src/app.css',
      cssVariablePaths: ['/workspace/tokens.css'],
      trustedSelectors: [':root'],
      debug: false,
    })

    expect(readCalls).toStrictEqual(['/workspace/tokens.css'])

    fileTexts.set('/workspace/tokens.css', ':root { --brand: #ff0000; }')
    fileStats.set('/workspace/tokens.css', { mtimeMs: 2, size: 29 })

    await loadCssVarSourceDeclarations({
      currentFilePath: '/workspace/src/app.css',
      cssVariablePaths: ['/workspace/tokens.css'],
      trustedSelectors: [':root'],
      debug: false,
    })

    expect(readCalls).toStrictEqual([
      '/workspace/tokens.css',
      '/workspace/tokens.css',
    ])
  })

  it('recursively loads css-like files from configured directories', async () => {
    directories.set('/workspace/styles', ['tokens.css', 'nested'])
    directories.set('/workspace/styles/nested', ['theme.scss', 'notes.txt'])
    fileExists.add('/workspace/styles/tokens.css')
    fileExists.add('/workspace/styles/nested/theme.scss')
    fileTexts.set('/workspace/styles/tokens.css', ':root { --brand: #0ea5e9; }')
    fileTexts.set(
      '/workspace/styles/nested/theme.scss',
      ':root { --accent: #ff0000; }',
    )
    fileStats.set('/workspace/styles/tokens.css', { mtimeMs: 1, size: 29 })
    fileStats.set('/workspace/styles/nested/theme.scss', {
      mtimeMs: 1,
      size: 30,
    })

    const { loadCssVarSourceDeclarations } =
      await import('../src/strategies/css-var-sources')
    const declarations = await loadCssVarSourceDeclarations({
      currentFilePath: '/workspace/src/app.css',
      cssVariablePaths: ['/workspace/styles'],
      trustedSelectors: [':root'],
      debug: false,
    })

    expect(declarations.map(declaration => declaration.name)).toStrictEqual([
      '--brand',
      '--accent',
    ])
  })

  it('skips unreadable external files', async () => {
    fileExists.add('/workspace/missing.css')
    fileStats.set('/workspace/missing.css', { mtimeMs: 1, size: 20 })

    const { loadCssVarSourceDeclarations } =
      await import('../src/strategies/css-var-sources')
    const declarations = await loadCssVarSourceDeclarations({
      currentFilePath: '/workspace/src/app.css',
      cssVariablePaths: ['/workspace/missing.css'],
      trustedSelectors: [':root'],
      debug: false,
    })

    expect(declarations).toStrictEqual([])
  })
})
```

- [ ] **Step 2: Run the failing cache tests**

Run:

```bash
rtk pnpm test tests/css-vars-cache.test.ts
```

Expected: FAIL because `css-var-sources.ts` and `findWorkspaceFiles` do not
exist.

- [ ] **Step 3: Add workspace file discovery and directory helpers**

In `src/utils/workspace-file-system.ts`, add this export near the other
workspace FS helpers:

```ts
export async function workspacePathIsDirectory(
  filePath: string,
): Promise<boolean> {
  const { FileType, workspace } = await import('vscode')

  try {
    const stat = await workspace.fs.stat(await toUri(filePath))
    return (stat.type & FileType.Directory) !== 0
  } catch {
    return false
  }
}

export async function readWorkspaceDirectory(
  dirPath: string,
): Promise<Array<readonly [string, number]>> {
  const { workspace } = await import('vscode')

  return workspace.fs.readDirectory(await toUri(dirPath))
}

export async function findWorkspaceFiles(
  pathPattern: string,
): Promise<string[]> {
  const { RelativePattern, workspace } = await import('vscode')

  const workspaceFolder = workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    return [pathPattern]
  }

  const pattern = new RelativePattern(workspaceFolder, pathPattern)
  const uris = await workspace.findFiles(pattern)
  return uris.map(uri => uri.toString())
}
```

- [ ] **Step 4: Create the CSS variable source loader**

Create `src/strategies/css-var-sources.ts` with:

```ts
import type { CssVarDeclaration } from './css-var-parser'
import { collectCssVarDeclarations } from './css-var-parser'
import {
  findWorkspaceFiles,
  joinWorkspacePath,
  readWorkspaceDirectory,
  readWorkspaceFile,
  statWorkspaceFile,
  workspacePathExists,
  workspacePathIsDirectory,
} from '../utils/workspace-file-system'
import { logger } from '../utils/logger'

const MAX_CSS_VAR_SOURCE_FILES = 64
const MAX_CSS_VAR_SOURCE_FILE_SIZE = 512 * 1024
const MAX_CSS_VAR_SOURCE_CACHE_SIZE = 256

interface CssVarSourceCacheEntry {
  readonly mtimeMs: number
  readonly size: number
  readonly text: string
}

export interface LoadCssVarSourceDeclarationsOptions {
  readonly currentFilePath?: string
  readonly cssVariablePaths: readonly string[]
  readonly trustedSelectors: readonly string[]
  readonly debug: boolean
}

const cssVarSourceCache = new Map<string, CssVarSourceCacheEntry>()

function isCssLikeSource(filePath: string): boolean {
  return /\.(?:css|scss|less)$/iu.test(filePath)
}

async function readCachedCssVarSource(
  filePath: string,
  debug: boolean,
): Promise<string | null> {
  try {
    const stats = await statWorkspaceFile(filePath)
    if (stats.size > MAX_CSS_VAR_SOURCE_FILE_SIZE) {
      if (debug) {
        logger.info(`[debug] Skipping large CSS variable source: ${filePath}`)
      }
      return null
    }

    const cached = cssVarSourceCache.get(filePath)
    if (
      cached &&
      cached.mtimeMs === stats.mtimeMs &&
      cached.size === stats.size
    ) {
      return cached.text
    }

    const text = await readWorkspaceFile(filePath)
    cssVarSourceCache.set(filePath, {
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      text,
    })

    if (cssVarSourceCache.size > MAX_CSS_VAR_SOURCE_CACHE_SIZE) {
      const oldestKey = cssVarSourceCache.keys().next().value
      if (oldestKey) cssVarSourceCache.delete(oldestKey)
    }

    return text
  } catch (error) {
    if (debug) {
      logger.info(
        `[debug] Failed to read CSS variable source ${filePath}: ${String(error)}`,
      )
    }
    return null
  }
}

async function expandCssVarSourcePath(pathPattern: string): Promise<string[]> {
  if (/[{*?]/u.test(pathPattern)) {
    return (await findWorkspaceFiles(pathPattern)).filter(isCssLikeSource)
  }

  if (await workspacePathIsDirectory(pathPattern)) {
    return collectCssLikeFilesFromDirectory(pathPattern)
  }

  if (await workspacePathExists(pathPattern)) {
    return isCssLikeSource(pathPattern) ? [pathPattern] : []
  }

  return []
}

async function collectCssLikeFilesFromDirectory(
  dirPath: string,
): Promise<string[]> {
  const filePaths: string[] = []
  const entries = await readWorkspaceDirectory(dirPath)

  for (const [name] of entries) {
    const childPath = joinWorkspacePath(dirPath, name)
    if (await workspacePathIsDirectory(childPath)) {
      filePaths.push(...(await collectCssLikeFilesFromDirectory(childPath)))
    } else if (isCssLikeSource(childPath)) {
      filePaths.push(childPath)
    }
    if (filePaths.length >= MAX_CSS_VAR_SOURCE_FILES) break
  }

  return filePaths
}

export async function loadCssVarSourceDeclarations(
  options: LoadCssVarSourceDeclarationsOptions,
): Promise<CssVarDeclaration[]> {
  const filePaths: string[] = []
  for (const sourcePath of options.cssVariablePaths) {
    filePaths.push(...(await expandCssVarSourcePath(sourcePath)))
    if (filePaths.length >= MAX_CSS_VAR_SOURCE_FILES) break
  }

  const declarations: CssVarDeclaration[] = []
  let sourceOrderOffset = 0

  for (const filePath of filePaths.slice(0, MAX_CSS_VAR_SOURCE_FILES)) {
    const text = await readCachedCssVarSource(filePath, options.debug)
    if (!text) continue

    const sourceDeclarations = collectCssVarDeclarations(text, {
      filePath,
      trustedSelectors: options.trustedSelectors,
      sourceOrderOffset,
    })
    declarations.push(...sourceDeclarations)
    sourceOrderOffset += sourceDeclarations.length
  }

  return declarations
}
```

- [ ] **Step 5: Run cache tests**

Run:

```bash
rtk pnpm test tests/css-vars-cache.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
rtk git add src/utils/workspace-file-system.ts src/strategies/css-var-sources.ts tests/css-vars-cache.test.ts
rtk git commit -m "feat: load css variable source files"
```

## Task 5: Integrate Cross-File CSS Vars Into `findCssVars`

**Files:**

- Modify: `src/strategies/css-vars.ts`
- Test: `tests/css-vars.test.ts`

- [ ] **Step 1: Write cross-file integration tests**

Add this mock setup near the top of `tests/css-vars.test.ts`:

```ts
const cssVarSourceDeclarations: unknown[] = []

vi.mock(import('../src/strategies/css-var-sources'), () => ({
  loadCssVarSourceDeclarations: vi.fn(async () => cssVarSourceDeclarations),
}))
```

Update the Vitest import to include `beforeEach` and `vi`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
```

Add this `beforeEach` inside the suite:

```ts
beforeEach(() => {
  cssVarSourceDeclarations.length = 0
})
```

Add these tests:

```ts
it('does not read external CSS variable paths by default', async () => {
  const { loadCssVarSourceDeclarations } =
    await import('../src/strategies/css-var-sources')

  await findCssVars('.button { color: var(--brand); }', {
    languageId: 'css',
    filePath: '/workspace/src/app.css',
    resolveCssVariablesAcrossFiles: false,
    cssVariablePaths: ['/workspace/tokens.css'],
    cssVariableTrustedSelectors: [':root'],
  })

  expect(loadCssVarSourceDeclarations).not.toHaveBeenCalled()
})

it('resolves CSS variables from configured external sources when enabled', async () => {
  cssVarSourceDeclarations.push({
    name: '--brand',
    value: '#0ea5e9',
    selector: ':root',
    normalizedSelector: ':root',
    specificity: [0, 1, 0],
    sourceOrder: 0,
    filePath: '/workspace/tokens.css',
    isTrusted: true,
  })

  const text = '.button { color: var(--brand); }'
  const result = await findCssVars(text, {
    languageId: 'css',
    filePath: '/workspace/src/app.css',
    resolveCssVariablesAcrossFiles: true,
    cssVariablePaths: ['/workspace/tokens.css'],
    cssVariableTrustedSelectors: [':root'],
  })

  expect(result).toStrictEqual([
    {
      start: text.indexOf('var(--brand)'),
      end: text.indexOf('var(--brand)') + 'var(--brand)'.length,
      color: 'rgb(14, 165, 233)',
    },
  ])
})
```

- [ ] **Step 2: Run the failing integration tests**

Run:

```bash
rtk pnpm test tests/css-vars.test.ts
```

Expected: FAIL because `findCssVars` does not load external sources yet.

- [ ] **Step 3: Load external declarations when enabled**

Update `src/strategies/css-vars.ts`:

```ts
import type { ColorMatch, StrategyContext } from '../types'
import { collectCssVarDeclarations } from './css-var-parser'
import { resolveCssVarMatches } from './css-var-resolver'
import { loadCssVarSourceDeclarations } from './css-var-sources'
```

Replace the return statement in `findCssVars` with:

```ts
const externalDeclarations =
  context?.resolveCssVariablesAcrossFiles === true
    ? await loadCssVarSourceDeclarations({
        currentFilePath: context.filePath,
        cssVariablePaths: context.cssVariablePaths ?? [],
        trustedSelectors,
        debug: false,
      })
    : []

return resolveCssVarMatches(text, {
  currentDeclarations,
  externalDeclarations,
})
```

- [ ] **Step 4: Run CSS variable integration tests**

Run:

```bash
rtk pnpm test tests/css-vars.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add src/strategies/css-vars.ts tests/css-vars.test.ts
rtk git commit -m "feat: resolve css variables across configured files"
```

## Task 6: Documentation And Generated Config Table

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update README settings table**

In `README.md`, add these rows after the SCSS settings:

```md
| `color-highlight.resolveCssVariablesAcrossFiles` | Resolve CSS custom properties from configured source paths. Disabled by default because runtime cascade can make variables ambiguous. | `boolean` | `false` |
| `color-highlight.cssVariablePaths` | File, directory, or glob paths used as external CSS custom property sources. | `array` | `[]` |
| `color-highlight.cssVariableTrustedSelectors` | Selectors trusted for cross-file CSS variable resolution. | `array` | `[":root", "html", "body", ":host"]` |
```

- [ ] **Step 2: Update README example config**

In the JSON config example, add:

```json
  "color-highlight.resolveCssVariablesAcrossFiles": false,
  "color-highlight.cssVariablePaths": [],
  "color-highlight.cssVariableTrustedSelectors": [":root", "html", "body", ":host"],
```

- [ ] **Step 3: Add a short behavior note**

Add this paragraph near the supported color formats or settings section:

```md
CSS custom property resolution across files is conservative. It only runs when
`color-highlight.resolveCssVariablesAcrossFiles` is enabled, reads the paths in
`color-highlight.cssVariablePaths`, and trusts declarations only from selectors
listed in `color-highlight.cssVariableTrustedSelectors`. Ambiguous runtime
cascade cases are skipped instead of guessed.
```

- [ ] **Step 4: Run format check**

Run:

```bash
rtk pnpm format:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add README.md
rtk git commit -m "docs: document css variable resolution settings"
```

## Task 7: Full Verification

**Files:**

- No source edits unless verification reveals a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
rtk pnpm test tests/css-vars.test.ts tests/css-vars-cache.test.ts tests/use-color-highlight.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
rtk pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
rtk pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
rtk pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Run format check**

Run:

```bash
rtk pnpm format:check
```

Expected: PASS.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
rtk git status --short
rtk git diff --stat HEAD
```

Expected: only intentional implementation and documentation changes remain.

- [ ] **Step 7: Final verification commit if needed**

If verification required a small fix, commit it:

```bash
rtk git add src tests README.md package.json
rtk git commit -m "fix: stabilize css variable resolution"
```

If no changes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: configuration, default-off behavior, configured paths,
  trusted selectors, conservative ambiguity handling, fallback/nested/cycle
  resolution, caching, error handling, tests, and docs all have tasks.
- Placeholder scan: no placeholders are intentionally left for implementers.
- Type consistency: the plan consistently uses
  `resolveCssVariablesAcrossFiles`, `cssVariablePaths`, and
  `cssVariableTrustedSelectors` in config, run options, and strategy context.
