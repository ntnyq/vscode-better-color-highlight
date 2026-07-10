# Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate worktree test discovery, exercise real highlighting in both extension hosts, and add repeatable detector benchmarks.

**Architecture:** Preserve Vitest defaults while excluding repository-local worktrees, share a platform-neutral in-memory CSS scenario between desktop and Web extension-host tests, and keep performance measurements in an opt-in benchmark suite. Runtime extension code and user configuration do not change.

**Tech Stack:** TypeScript, Vitest 4, VS Code Extension API, `@vscode/test-electron`, `@vscode/test-web`, pnpm.

## Global Constraints

- Use pnpm for package tasks.
- Prefix shell commands with `rtk`, except run `pnpm typecheck` directly.
- Keep ESM, strict TypeScript, two-space indentation, single quotes, no semicolons, and trailing commas.
- Do not add timing thresholds to CI.
- Keep desktop, VS Code Web, and virtual-workspace compatibility.
- Commit the complete phase as `test: harden repository quality gates`.

---

### Task 1: Exclude linked worktrees from Vitest discovery

**Files:**

- Modify: `vitest.config.ts`
- Create: `tests/vitest-config.test.ts`

**Interfaces:**

- Consumes: Vitest `configDefaults.exclude`.
- Produces: `test.exclude` containing all defaults plus `**/.worktrees/**`.

- [x] **Step 1: Write the failing configuration test**

```ts
import { describe, expect, it } from 'vitest'
import config from '../vitest.config'

describe('vitest configuration', () => {
  it('excludes repository-local linked worktrees', () => {
    expect(config.test?.exclude).toContain('**/.worktrees/**')
  })
})
```

- [x] **Step 2: Run the test and verify RED**

Run: `rtk pnpm test:unit --run tests/vitest-config.test.ts`

Expected: FAIL because `test.exclude` is currently undefined.

- [x] **Step 3: Extend the default exclusions**

```ts
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
    watch: false,
  },
})
```

- [x] **Step 4: Run the focused and main-checkout tests**

Run in the roadmap worktree:
`rtk pnpm test:unit --run tests/vitest-config.test.ts`

Run in the main checkout while linked worktrees exist:
`rtk pnpm test:unit --run`

Expected: the focused test passes and the main checkout reports each project test once instead of discovering tests below `.worktrees/`.

### Task 2: Share a real extension-host highlight scenario

**Files:**

- Create: `tests/e2e/shared.ts`
- Modify: `tests/e2e/suite/index.ts`
- Modify: `tests/e2e/web.ts`
- Modify: `tsconfig.json`

**Interfaces:**

- Produces: `activateExtension(): Promise<void>`, `assertRequiredCommands(): Promise<void>`, and `assertInMemoryCssHighlighting(): Promise<void>`.
- Consumes: existing internal command `color-highlight.internal.getHighlightState`.

- [x] **Step 0: Allow explicit TypeScript ESM imports**

Add `"allowImportingTsExtensions": true` to `compilerOptions` in
`tsconfig.json`. Desktop tests execute TypeScript directly with Node ESM, while
the Web entry bundles the same explicit `.ts` imports.

- [x] **Step 1: Extract shared activation, command, and polling helpers**

Create `tests/e2e/shared.ts` with an in-memory CSS fixture containing exactly
three matches:

```ts
import { commands, extensions, window, workspace } from 'vscode'

const EXTENSION_ID = 'ntnyq.vscode-better-color-highlight'
const GET_HIGHLIGHT_STATE_COMMAND = 'color-highlight.internal.getHighlightState'
const REQUIRED_COMMANDS = [
  'color-highlight.enable',
  'color-highlight.disable',
  'color-highlight.copyColorAsHex',
  'color-highlight.copyColorAsRgb',
  'color-highlight.copyColorAsHsl',
  'color-highlight.copyColorAsOklch',
] as const

interface HighlightState {
  readonly colorCount: number
  readonly colors: readonly string[]
  readonly languageId: string
  readonly matchCount: number
  readonly uri: string
}

export async function activateExtension(): Promise<void> {
  const extension = extensions.getExtension(EXTENSION_ID)
  assertCondition(extension, `Expected ${EXTENSION_ID} to be installed`)
  await extension.activate()
  assertEqual(extension.isActive, true, `Expected ${EXTENSION_ID} to activate`)
}

export async function assertRequiredCommands(): Promise<void> {
  const registered = await commands.getCommands(true)
  for (const command of REQUIRED_COMMANDS) {
    assertCondition(
      registered.includes(command),
      `Expected ${command} to be registered`,
    )
  }
}

export async function assertInMemoryCssHighlighting(): Promise<void> {
  const document = await workspace.openTextDocument({
    content:
      '.sample { color: #ff0000; background: rgb(0 255 0); border-color: blue; }',
    language: 'css',
  })
  await window.showTextDocument(document)
  const state = await waitForHighlightState(document.uri.toString(), 3)
  assertEqual(state.languageId, 'css', 'Expected CSS highlight state')
  assertEqual(state.colorCount, 3, 'Expected three unique colors')
  assertEqual(
    JSON.stringify([...state.colors].sort()),
    JSON.stringify(
      ['rgb(255, 0, 0)', 'rgb(0, 255, 0)', 'rgb(0, 0, 255)'].sort(),
    ),
    'Expected resolved red, green, and blue colors',
  )
}

async function waitForHighlightState(
  uri: string,
  expectedMatchCount: number,
): Promise<HighlightState> {
  let lastState: HighlightState | undefined
  for (let attempt = 0; attempt < 40; attempt++) {
    lastState = await commands.executeCommand<HighlightState | undefined>(
      GET_HIGHLIGHT_STATE_COMMAND,
      uri,
    )
    if (lastState?.matchCount === expectedMatchCount) {
      return lastState
    }
    /* oxlint-disable-next-line promise/avoid-new -- browser-compatible timer bridge */
    await new Promise<void>(resolve => {
      setTimeout(resolve, 100)
    })
  }

  throw new Error(
    `Expected ${expectedMatchCount} color matches for ${uri}; last state: ${JSON.stringify(lastState)}`,
  )
}

function assertCondition(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message)
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}; expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    )
  }
}
```

The shared module must not import `node:*` modules because it is bundled for VS
Code Web.

- [x] **Step 2: Use the shared scenario in desktop E2E**

Replace duplicated activation and command assertions in
`tests/e2e/suite/index.ts` with:

```ts
await activateExtension()
await assertRequiredCommands()
await assertInMemoryCssHighlighting()
```

Retain the playground snapshot count and configuration mutation checks.

- [x] **Step 3: Make Web E2E verify actual highlighting**

Replace the activation-only implementation in `tests/e2e/web.ts` with:

```ts
import {
  activateExtension,
  assertInMemoryCssHighlighting,
  assertRequiredCommands,
} from './shared.ts'

export async function run() {
  await activateExtension()
  await assertRequiredCommands()
  await assertInMemoryCssHighlighting()
}
```

- [x] **Step 4: Run both extension hosts**

Run: `rtk pnpm test:e2e`

Expected: desktop and Web runners exit 0, and both execute the in-memory CSS highlight assertion.

### Task 3: Add opt-in detector performance benchmarks

**Files:**

- Create: `benchmarks/color-detection.bench.ts`
- Modify: `package.json`

**Interfaces:**

- Produces: `pnpm bench`, backed by `vitest bench --run`.
- Consumes: production literal, Tailwind, CSS declaration, and CSS variable resolver functions.

- [x] **Step 1: Add the benchmark command**

Add to `package.json` scripts:

```json
"bench": "vitest bench --run"
```

- [x] **Step 2: Add deterministic benchmark fixtures**

Create `benchmarks/color-detection.bench.ts` with three cases:

```ts
import { bench, describe } from 'vitest'
import { findColorFunctions } from '../src/strategies/color-functions'
import { collectCssVarDeclarations } from '../src/strategies/css-vars/parser'
import { resolveCssVarMatches } from '../src/strategies/css-vars/resolver'
import { findHexRGBA } from '../src/strategies/hex'
import { findTailwindThemeColors } from '../src/strategies/tailwind-theme-colors'

const literalCss = Array.from(
  { length: 400 },
  (_, index) =>
    `.item-${index} { color: #ff0000; background: oklch(70% 0.2 40); }`,
).join('\n')

const tailwindMarkup = Array.from(
  { length: 500 },
  () => '<div class="bg-red-500 text-sky-300 hover:border-white/75"></div>',
).join('\n')

const variableCss = Array.from(
  { length: 100 },
  (_, index) =>
    `:root { --color-${index}: #${index.toString(16).padStart(6, '0')}; }`,
).join('\n')
const variableUsages = Array.from(
  { length: 100 },
  (_, index) => `.item-${index} { color: var(--color-${index}); }`,
).join('\n')
const declarations = collectCssVarDeclarations(variableCss, {
  trustedSelectors: [':root'],
})

describe('color detection', () => {
  bench('direct CSS literals', () => {
    findHexRGBA(literalCss)
    findColorFunctions(literalCss)
  })

  bench('Tailwind utilities', () => {
    findTailwindThemeColors(tailwindMarkup)
  })

  bench('CSS custom property resolution', async () => {
    await resolveCssVarMatches(variableUsages, {
      currentDeclarations: declarations,
      externalDeclarations: [],
    })
  })
})
```

- [x] **Step 3: Run the benchmark suite**

Run: `rtk pnpm bench`

Expected: three benchmark cases complete without errors; results are reported
for comparison but not checked against a fixed duration.

### Task 4: Full verification and phase commit

**Files:**

- Modify: `docs/superpowers/plans/2026-07-11-quality-hardening.md` to mark completed steps.

**Interfaces:** None.

- [x] **Step 1: Run repository gates**

Run:

```text
rtk pnpm format
rtk pnpm format:check
rtk pnpm lint
pnpm typecheck
rtk pnpm test:unit --run
rtk pnpm build
rtk pnpm test:e2e
rtk pnpm bench
rtk git diff --check
```

Expected: every command exits 0.

- [x] **Step 2: Review scope**

Run: `rtk git status -sb` and `rtk git diff --stat`.

Expected: only the plan, Vitest configuration/test, shared E2E files, benchmark,
and package script are changed.

- [x] **Step 3: Commit the phase**

```text
rtk git add vitest.config.ts tests/vitest-config.test.ts tests/e2e/shared.ts tests/e2e/suite/index.ts tests/e2e/web.ts benchmarks/color-detection.bench.ts package.json docs/superpowers/plans/2026-07-11-quality-hardening.md
rtk git commit -m 'test: harden repository quality gates'
```
