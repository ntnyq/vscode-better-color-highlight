# Review Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct all seven confirmed project-review findings and remove the confirmed dead code without changing unrelated behavior.

**Architecture:** Keep color conversion pure, make cross-file invalidation a shared reactive input for highlighting and hover caching, and keep command validation at the external-input boundary. CSS custom-property resolution remains conservative: declarations from distinct selector or at-rule contexts are treated as ambiguous instead of guessed.

**Tech Stack:** TypeScript, VS Code extension APIs, reactive-vscode, Vitest, pnpm, tsdown, oxlint, oxfmt.

## Global Constraints

- Use pnpm for package tasks; run `pnpm typecheck` without the `rtk` prefix.
- Prefix every other shell command with `rtk`.
- Preserve ESM, strict TypeScript, two-space indentation, single quotes, no semicolons, and trailing commas.
- Write and verify a failing regression test before each production behavior change.
- Keep desktop, VS Code Web, and virtual-workspace support.
- Do not commit or push unless the user asks.

---

### Task 1: CSS Color 4 Lab-family conversion

**Files:**

- Modify: `src/utils/color/convert.ts`
- Modify: `src/strategies/color-functions.ts`
- Test: `tests/convert.test.ts`
- Test: `tests/color-functions.test.ts`
- Update: `tests/__snapshots__/playground/*.snap`

**Interfaces:**

- Consumes: `labToRgb`, `lchToRgb`, and color-function channel parsing.
- Produces: D50-based Lab/LCH conversion adapted to D65 sRGB and percentage channels scaled to CSS Color 4 reference ranges.

- [x] Add assertions that `labToRgb(0, 0, 0)` is black, `labToRgb(50, 0, 0)` is approximately `[119, 119, 119]`, and percentage Lab/LCH syntax equals the equivalent numeric syntax.
- [x] Run `rtk pnpm test:unit --run tests/convert.test.ts tests/color-functions.test.ts` and confirm the new assertions fail on the old conversion.
- [x] Replace the double Lab transform with direct Lab f-coordinates, D50 XYZ scaling, and D50-to-D65 adaptation; parse percentages with per-space reference scales.
- [x] Rerun the focused tests and confirm they pass.

### Task 2: Shared dependency invalidation and open-document reads

**Files:**

- Create: `src/composables/use-stylesheet-dependency-revision.ts`
- Modify: `src/index.ts`
- Modify: `src/composables/use-color-highlight.ts`
- Modify: `src/utils/workspace-file-system.ts`
- Modify: `src/types/workspace.ts`
- Test: `tests/use-color-highlight.test.ts`
- Test: `tests/workspace-file-system.test.ts`

**Interfaces:**

- Produces: `useStylesheetDependencyRevision(): Readonly<Ref<number>>`.
- Consumes: the returned revision in highlight and hover run/cache signatures.

- [x] Add a failing highlight test proving a dependency revision change reruns an unchanged consuming document.
- [x] Add a failing workspace filesystem test proving open unsaved document text and version participate in reads/cache metadata.
- [x] Implement a dynamically enabled stylesheet filesystem watcher plus open-document change listener, and pass its revision from `src/index.ts` into highlighting and hover.
- [x] Prefer `workspace.textDocuments` content and expose `documentVersion` in `WorkspaceFileStat` so unchanged disk metadata cannot retain stale cache text.
- [x] Run the two focused suites and confirm they pass.

### Task 3: Conservative CSS custom-property context resolution

**Files:**

- Modify: `src/strategies/css-vars/parser.ts`
- Modify: `src/strategies/css-vars/resolver.ts`
- Test: `tests/css-vars.test.ts`

**Interfaces:**

- Extend `CssVarDeclaration` with `atRuleContext: readonly string[]`.
- Select candidates only when all declarations share one selector and at-rule context.

- [x] Add failing cases for the same variable declared under different selectors and for `:root` declarations split between normal and media-query contexts.
- [x] Preserve enclosing at-rule preludes while walking nested CSS blocks.
- [x] Return `ambiguous` for declarations with distinct context signatures; retain source-order selection inside one identical context.
- [x] Run `rtk pnpm test:unit --run tests/css-vars.test.ts` and confirm green.

### Task 4: Versioned hover-match cache

**Files:**

- Modify: `src/hover/color-hover.ts`
- Modify: `src/composables/use-color-hover.ts`
- Test: `tests/color-hover.test.ts`

**Interfaces:**

- Produce a bounded cache keyed by document URI/version, dependency revision, and relevant configuration.
- Split detector execution from offset lookup so cached matches can be reused.

- [x] Add a failing test proving two lookups with the same key call the detector loader once and a changed key calls it again.
- [x] Implement a bounded promise cache and extract reusable match detection/hover lookup functions.
- [x] Use the cache in the hover provider and include the shared dependency revision in its signature.
- [x] Run the hover tests and confirm green.

### Task 5: Document-bound edit commands

**Files:**

- Modify: `src/commands/types.ts`
- Modify: `src/commands/payloads.ts`
- Modify: `src/commands/editor-range.ts`
- Modify: `src/hover/color-hover.ts`
- Modify: `src/commands/copy-color.ts`
- Test: `tests/commands.test.ts`
- Test: `tests/color-hover.test.ts`

**Interfaces:**

- Add required `uri: string` to replacement and alpha payloads.
- Require `documentUri: string` when constructing hover command links.

- [x] Update valid payload fixtures with the originating URI and add a failing test where a different URI must not edit the active document.
- [x] Validate URI payloads and compare them with `editor.document.uri.toString()` before editing.
- [x] Include the document URI in every hover-generated replace/alpha command payload.
- [x] Run command and hover tests and confirm green.

### Task 6: Awaitable configuration commands and pinned release tooling

**Files:**

- Modify: `src/commands/index.ts`
- Modify: `.github/workflows/release.yml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `tests/commands.test.ts`
- Create: `tests/release-workflow.test.ts`

**Interfaces:**

- Command handlers return the `WorkspaceConfiguration.update` thenable.
- Release workflow installs the frozen lockfile and runs an exact `changelogithub` dependency via `pnpm exec`.

- [x] Add a failing command test asserting the enable handler returns the update promise.
- [x] Add a failing workflow test asserting `changelogithub` is exact-pinned and no `npx changelogithub` invocation remains.
- [x] Return configuration update promises directly from command callbacks.
- [x] Add the exact development dependency with pnpm, install from the frozen lockfile in release CI, and use `pnpm exec changelogithub`.
- [x] Run both focused suites and confirm green.

### Task 7: Confirmed dead-code removal and full verification

**Files:**

- Modify: `src/utils/color-match.ts`
- Modify: `src/utils/workspace-file-system.ts`
- Modify: `src/strategies/css-vars/parser.ts`
- Modify: affected tests and mocks

**Interfaces:**

- Remove production exports with no production consumers: `mergeMatches`, `readWorkspaceDirectory`, and unused CSS specificity/trust helpers and metadata.

- [x] Remove each symbol and its isolated test/mock coverage, then verify `rtk rg` finds no consumer.
- [x] Update intentional playground snapshots after reviewing every diff.
- [x] Run `rtk pnpm format`, `rtk pnpm lint`, `pnpm typecheck`, `rtk pnpm test:unit --run`, `rtk pnpm build`, and `rtk pnpm test:e2e`.
- [x] Run `rtk pnpm audit --prod`, inspect `rtk git diff --check`, and review the complete diff for unrelated changes.
