# Workspace Palette and Contrast Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand workspace color palette, manual WCAG contrast
comparison, and opt-in deterministic contrast diagnostics.

**Architecture:** Reuse the existing strategy registry for every resolved
color. A bounded Workspace FS scanner builds an ephemeral grouped palette,
while pure structural parsers identify only same-context CSS/inline/Tailwind
foreground-background pairs. VS Code Quick Pick commands and a debounced
diagnostic service consume those pure models without adding a persistent
workspace index.

**Tech Stack:** TypeScript, VS Code API, reactive-vscode, existing color
detectors and formatters, Vitest, tsdown, Workspace FS.

## Global Constraints

- Keep the extension compatible with desktop, `vscode.dev`, `github.dev`, and
  virtual workspaces; do not use Node filesystem/path APIs.
- Workspace palette scans are explicit, cancellable, and stateless after the
  Quick Pick session ends.
- Limit one scan to 256 source files, 512 KiB of UTF-8 text per source, and 512
  unique cross-file dependency reads.
- Retain at most 2,000 occurrences per file, 20,000 occurrences globally, and
  1,024 distinct color groups. Report occurrence truncation separately from
  the 256-file query truncation.
- Use `workspacePaletteInclude = "**/*"` and
  `workspacePaletteExclude = "{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}"`
  as exact defaults.
- Keep `enableContrastDiagnostics = false` by default.
- Emit diagnostics only for deterministic same-context pairs and only below
  the WCAG AA normal-text threshold of 4.5:1.
- Never guess across selectors, inheritance, runtime state, gradients, images,
  blend modes, filters, unknown canvases, or ambiguous color expressions.
- Preserve all existing strategy trust gates, loader bounds, caches,
  cancellation, source ranges, v3/v4 semantics, and error isolation.
- Use TDD for every behavior change and keep implementation tasks as temporary
  commits until the final consolidated feature commit.

---

### Task 1: Pure palette model and WCAG contrast evaluation

**Files:**

- Create: `src/workspace-palette/types.ts`
- Create: `src/workspace-palette/model.ts`
- Create: `src/contrast/evaluate.ts`
- Modify: `src/utils/color/contrast.ts`
- Create: `tests/workspace-palette-model.test.ts`
- Create: `tests/contrast-evaluation.test.ts`
- Modify: `tests/contrast.test.ts`

**Interfaces:**

- Produce `groupWorkspaceColorOccurrences(occurrences, stats): WorkspacePaletteResult`.
- Produce `evaluateColorContrast(foreground, background): ColorContrastEvaluation`.
- Reuse `ColorPresentations` and `RgbaColor` from
  `src/utils/color/presentation.ts`.

- [x] Add failing palette-model tests for URI/range/color deduplication,
      canonical-color grouping, exact `sourceText`, presentation generation,
      occurrence/file counts, descending-count ordering, canonical tie-breaking,
      URI/offset occurrence ordering, empty input, and propagation of scanned,
      skipped, and truncated scan metadata.

  ```ts
  const result = groupWorkspaceColorOccurrences(
    [
      occurrence('file:///b.css', 9, 13, 'red', 'rgb(255, 0, 0)'),
      occurrence('file:///a.css', 2, 6, '#f00', 'rgb(255, 0, 0)'),
      occurrence('file:///a.css', 2, 6, '#f00', 'rgb(255, 0, 0)'),
    ],
    { scannedFileCount: 2, skippedFileCount: 1, truncated: false },
  )

  expect(result.groups[0].presentations.hex).toBe('#ff0000')
  expect(result.groups[0].occurrences.map(item => item.uri)).toEqual([
    'file:///a.css',
    'file:///b.css',
  ])
  ```

- [x] Add failing contrast tests for black/white 21:1, equal colors 1:1,
      threshold edges at 3, 4.5, and 7, unrounded pass/fail decisions,
      translucent-foreground sRGB compositing, opaque foreground,
      translucent-background indeterminate results, and input clamping.

  ```ts
  expect(
    evaluateColorContrast(
      { r: 255, g: 255, b: 255, a: 0.5 },
      { r: 0, g: 0, b: 0, a: 1 },
    ),
  ).toMatchObject({
    kind: 'determinate',
    effectiveForeground: { r: 127.5, g: 127.5, b: 127.5, a: 1 },
  })

  expect(
    evaluateColorContrast(
      { r: 0, g: 0, b: 0, a: 1 },
      { r: 255, g: 255, b: 255, a: 0.5 },
    ),
  ).toEqual({
    kind: 'indeterminate',
    reason: 'translucent-background',
  })
  ```

- [x] Run the new suites and verify RED because the modules do not exist.

  ```bash
  rtk pnpm test:unit --run tests/workspace-palette-model.test.ts tests/contrast-evaluation.test.ts
  ```

- [x] Implement exact feature types in `types.ts`.

  ```ts
  export interface WorkspaceColorOccurrence {
    readonly color: string
    readonly end: number
    readonly sourceText: string
    readonly start: number
    readonly uri: string
  }

  export interface WorkspaceColorGroup {
    readonly color: string
    readonly occurrences: readonly WorkspaceColorOccurrence[]
    readonly presentations: ColorPresentations
  }

  export interface WorkspacePaletteResult {
    readonly groups: readonly WorkspaceColorGroup[]
    readonly occurrenceTruncated: boolean
    readonly scannedFileCount: number
    readonly skippedFileCount: number
    readonly truncated: boolean
  }

  export interface DeterminateColorContrast {
    readonly aaaLargeText: boolean
    readonly aaaNormalText: boolean
    readonly aaLargeText: boolean
    readonly aaNormalText: boolean
    readonly effectiveForeground: RgbaColor
    readonly kind: 'determinate'
    readonly ratio: number
  }

  export type ColorContrastEvaluation =
    | DeterminateColorContrast
    | {
        readonly kind: 'indeterminate'
        readonly reason: 'translucent-background'
      }
  ```

- [x] Implement grouping with a key of
      `${uri}:${start}:${end}:${color}`, reject colors unsupported by
      `getColorPresentations`, and sort exactly as the design specifies.

- [x] Extend the contrast utility with fractional-channel RGBA compositing and
      implement `evaluateColorContrast`. Keep relative luminance and threshold
      comparison on unrounded values. Retain the 256-entry fast path for integer
      channels and calculate fractional channels with the same sRGB transfer
      function.

  ```ts
  const effectiveForeground = compositeRgba(foreground, background)
  const ratio = contrastRatio(
    relativeLuminance(
      effectiveForeground.r,
      effectiveForeground.g,
      effectiveForeground.b,
    ),
    relativeLuminance(background.r, background.g, background.b),
  )
  ```

- [x] Run focused tests, legacy contrast/presentation tests, format, lint, and
      typecheck; verify GREEN.

  ```bash
  rtk pnpm test:unit --run tests/workspace-palette-model.test.ts tests/contrast-evaluation.test.ts tests/contrast.test.ts tests/color-presentations.test.ts
  rtk pnpm format:check
  rtk pnpm lint
  pnpm typecheck
  ```

- [x] Commit the independently testable pure model.

  ```bash
  rtk git add src/workspace-palette src/contrast/evaluate.ts src/utils/color/contrast.ts tests/workspace-palette-model.test.ts tests/contrast-evaluation.test.ts tests/contrast.test.ts
  rtk git commit -m "feat: add palette and contrast models"
  ```

### Task 2: Shared workspace dependency-read budget

**Files:**

- Create: `src/utils/workspace-read-budget.ts`
- Modify: `src/utils/workspace-file-system.ts`
- Modify: `src/types/color-highlight.ts`
- Modify: `src/strategies/css-vars/sources.ts`
- Modify: `src/strategies/css-vars/index.ts`
- Modify: `src/strategies/scss-vars.ts`
- Modify: `src/strategies/tailwind-theme/sources.ts`
- Modify: `src/strategies/design-tokens/external-loader.ts`
- Modify: `src/strategies/json-design-tokens.ts`
- Modify: `src/strategies/yaml-design-tokens.ts`
- Create: `tests/workspace-read-budget.test.ts`
- Modify: `tests/css-vars-cache.test.ts`
- Modify: `tests/scss-vars-cache.test.ts`
- Modify: `tests/tailwind-theme-sources.test.ts`
- Modify: `tests/design-token-external-loader.test.ts`

**Interfaces:**

- Produce `createWorkspaceReadBudget(maxUniqueReads): WorkspaceReadBudget`.
- Add optional `workspaceReadBudget?: WorkspaceReadBudget` to
  `StrategyContext` and each cross-file loader option/state.
- Produce `getWorkspacePathIdentity(pathOrUri): string` so a local fsPath and
  equivalent `file:` URI consume one budget slot.
- Reject non-positive, non-integer maximum values with `RangeError`.

- [x] Add failing budget tests for first claims, repeated claims, refusal after
      512 unique identities, a local `file:` URI/fsPath pair, Windows drive-letter
      casing, virtual URI distinction, and invalid maximum values.

  ```ts
  const budget = createWorkspaceReadBudget(2)
  expect(budget.tryClaim('file:///repo/a.css')).toBe(true)
  expect(budget.tryClaim('/repo/a.css')).toBe(true)
  expect(budget.tryClaim('/repo/b.css')).toBe(true)
  expect(budget.tryClaim('/repo/c.css')).toBe(false)
  ```

- [x] Add failing loader regressions that inject a two-slot budget, verify cache
      hits and repeated reads of one URI remain allowed, and verify CSS variables,
      SCSS, Tailwind, and external design tokens isolate the third unique file
      without throwing or returning partial invalid aliases.

- [x] Run all five budget/loader suites and verify RED.

  ```bash
  rtk pnpm test:unit --run tests/workspace-read-budget.test.ts tests/css-vars-cache.test.ts tests/scss-vars-cache.test.ts tests/tailwind-theme-sources.test.ts tests/design-token-external-loader.test.ts
  ```

- [x] Export canonical identity logic from `workspace-file-system.ts`, replace
      the Tailwind loader's private copy, and implement a Set-backed budget.

  ```ts
  export interface WorkspaceReadBudget {
    tryClaim(uri: string): boolean
  }

  export function createWorkspaceReadBudget(
    maxUniqueReads: number,
  ): WorkspaceReadBudget {
    const claimed = new Set<string>()
    return {
      tryClaim(value) {
        const identity = getWorkspacePathIdentity(value)
        if (claimed.has(identity)) return true
        if (claimed.size >= maxUniqueReads) return false
        claimed.add(identity)
        return true
      },
    }
  }
  ```

- [x] Thread the optional budget through every loader. Call `tryClaim` after a
      dependency path is resolved and before its first stat/content read. A refusal
      uses the loader's existing unreadable/missing isolation path. Existing callers
      that omit the budget must behave byte-for-byte as before.

- [x] Run focused loader tests, definition/navigation regressions, full unit
      tests, build, typecheck, lint, and format; verify GREEN and Web compatibility.

  ```bash
  rtk pnpm test:unit --run tests/workspace-read-budget.test.ts tests/css-vars-cache.test.ts tests/scss-vars-cache.test.ts tests/tailwind-theme-sources.test.ts tests/design-token-external-loader.test.ts tests/resolve-color-definition.test.ts
  rtk pnpm test:unit --run
  rtk pnpm build
  rtk pnpm format:check
  rtk pnpm lint
  pnpm typecheck
  ```

- [x] Commit the cross-loader safety primitive.

  ```bash
  rtk git add src/utils/workspace-read-budget.ts src/utils/workspace-file-system.ts src/types/color-highlight.ts src/strategies tests/workspace-read-budget.test.ts tests/css-vars-cache.test.ts tests/scss-vars-cache.test.ts tests/tailwind-theme-sources.test.ts tests/design-token-external-loader.test.ts
  rtk git commit -m "feat: bound workspace palette dependency reads"
  ```

### Task 3: Bounded workspace palette scanner and settings

**Files:**

- Create: `src/workspace-palette/scanner.ts`
- Modify: `package.json`
- Regenerate: `src/meta.ts`
- Create: `tests/workspace-palette-scanner.test.ts`
- Modify: `tests/readme.test.ts`

**Interfaces:**

- Produce
  `scanWorkspacePalette(options): Promise<WorkspacePaletteResult | null>`;
  `null` means the cancellation token was observed.
- Consume the Task 1 grouping model and a single Task 2 budget with limit 512.
- Add `workspacePaletteInclude` and `workspacePaletteExclude` configuration.

- [x] Add failing scanner tests with mocked VS Code Workspace FS for exact
      include/exclude arguments, 257-result truncation detection, URI sorting, the
      256-file cap, 512 KiB UTF-8 byte cap, existing `maxFileSize` character cap,
      NUL detection in the first 8 KiB, unsupported/excluded languages,
      unreadable/stat/open failures, empty workspaces, and detector isolation.

- [x] Add failing tests for an open unsaved document overriding disk content,
      no inclusion of untitled/new documents outside the query, virtual URIs,
      untrusted direct-color scanning, trusted-only dependency resolution, one
      shared 512-read budget, cancellation before/after each async boundary, and
      progress counts.

  ```ts
  const result = await scanWorkspacePalette({
    cancellationToken,
    config: testConfig,
    onProgress,
    workspaceIsTrusted: false,
  })

  expect(findFiles).toHaveBeenCalledWith(
    '**/*',
    '{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}',
    257,
  )
  expect(result?.truncated).toBe(true)
  ```

- [x] Run the scanner suite and metadata/readme contracts; verify RED.

  ```bash
  rtk pnpm test:unit --run tests/workspace-palette-scanner.test.ts tests/readme.test.ts
  ```

- [x] Add both string settings with the exact defaults and descriptions from
      the spec, run `rtk pnpm generate:meta`, and add contract assertions for the
      generated types/defaults.

- [x] Implement `scanWorkspacePalette` using
      `workspace.findFiles(include, exclude, 257)`, sorted first 256 URIs,
      `workspace.fs.stat`, and `workspace.openTextDocument`. Use `TextEncoder` for
      the 512 KiB bound, `shouldProcessLanguage`, `getStrategies`, and
      `runColorDetectors`. Pass one `createWorkspaceReadBudget(512)` instance to
      every document's `StrategyContext`.

  ```ts
  const uris = await workspace.findFiles(include, exclude, 257)
  const truncated = uris.length > 256
  const candidates = uris
    .toSorted((left, right) => left.toString().localeCompare(right.toString()))
    .slice(0, 256)
  ```

- [x] Return exact source slices for occurrences, deduplicate/group with Task 1,
      count successful/skipped files, report progress after each candidate, and
      return `null` immediately when cancellation is observed. Invalid/empty glob
      settings must show no partial data and throw a typed scan-configuration error
      for the command layer to display.

- [x] Enforce the per-file, global occurrence, and distinct-group retention
      caps while streaming. Stop source-file scanning at the global retained
      cap and set `occurrenceTruncated` for every cap-driven omission.

- [x] Run scanner, strategy, loader, generated-metadata, full unit, typecheck,
      lint, format, and desktop/Web build checks; verify GREEN.

  ```bash
  rtk pnpm test:unit --run tests/workspace-palette-scanner.test.ts tests/strategy-registry.test.ts tests/readme.test.ts
  rtk pnpm test:unit --run
  rtk pnpm build
  rtk pnpm format:check
  rtk pnpm lint
  pnpm typecheck
  ```

- [x] Commit the bounded scanner and settings.

  ```bash
  rtk git add src/workspace-palette/scanner.ts package.json src/meta.ts tests/workspace-palette-scanner.test.ts tests/readme.test.ts
  rtk git commit -m "feat: scan workspace color palettes"
  ```

### Task 4: Palette Quick Pick and manual contrast commands

**Files:**

- Create: `src/workspace-palette/quick-pick.ts`
- Create: `src/commands/workspace-palette.ts`
- Modify: `src/commands/index.ts`
- Modify: `package.json`
- Regenerate: `src/meta.ts`
- Create: `tests/workspace-palette-quick-pick.test.ts`
- Modify: `tests/commands.test.ts`
- Modify: `tests/readme.test.ts`
- Modify: `tests/e2e/shared.ts`

**Interfaces:**

- Produce `showWorkspacePalette(): Promise<void>`.
- Produce
  `checkWorkspaceColorContrast(input?: ContrastCommandInput): Promise<void>`.
- Register `color-highlight.showWorkspacePalette` and
  `color-highlight.checkColorContrast`.
- Define `ContrastColorSelection` with a canonical color plus an optional
  workspace occurrence, and define `ContrastCommandInput` with optional
  preselected background, foreground, and already-scanned palette. When both
  colors are supplied, the command performs no workspace scan.

- [x] Add failing Quick Pick tests for cancellable progress, empty results,
      truncated/skipped descriptions, group ordering, HEX copy button, contrast
      button, occurrence navigation and selection, four copy formats, deleted
      documents, back/cancel behavior, and disposal of each created Quick Pick.

- [x] Add failing manual contrast tests for background-then-foreground flow,
      preselected group and role, 21:1 output, all four WCAG levels, translucent
      foreground output, translucent-background indeterminate copy, rerun/back
      actions, and no second workspace scan inside one comparison session.

- [x] Add failing command/metadata/e2e smoke assertions proving both public
      command IDs register on desktop and Web without invoking a blocking Quick
      Pick or importing a Node API.

- [x] Run focused UI/command tests and verify RED.

  ```bash
  rtk pnpm test:unit --run tests/workspace-palette-quick-pick.test.ts tests/commands.test.ts tests/readme.test.ts
  ```

- [x] Add command contributions, regenerate metadata, and implement a
      `createQuickPick`-based interaction. Use `ThemeIcon('symbol-color')`, exact
      presentation strings, occurrence/file counts, item buttons for copy/contrast,
      and action rows for HEX/RGB/HSL/OKLCH.

- [x] Wrap Task 3 scanning in
      `window.withProgress({ location: ProgressLocation.Notification, cancellable: true })`.
      Convert scan configuration errors and unreadable selected occurrences into
      short warnings. Do not retain the palette after the session resolves.

- [x] Implement occurrence navigation with `workspace.openTextDocument`,
      `window.showTextDocument`, `Selection`, and `revealRange`. Validate the exact
      original `sourceText` before selecting; stale ranges warn and return to the
      occurrence list.

- [x] Implement the contrast flow using Task 1 evaluation. Display the unrounded
      calculation as a two-decimal ratio, AA/AAA normal/large pass states, effective
      composited foreground, and the indeterminate background reason. Reuse
      `env.clipboard.writeText` for copy actions.

  ```ts
  export interface ContrastColorSelection {
    readonly color: string
    readonly occurrence?: WorkspaceColorOccurrence
  }

  export interface ContrastCommandInput {
    readonly background?: ContrastColorSelection
    readonly foreground?: ContrastColorSelection
    readonly palette?: WorkspacePaletteResult
  }
  ```

- [x] Run focused UI tests, all command/provider tests, full unit tests,
      desktop/Web build, Electron/Web smoke tests, format, lint, and typecheck;
      verify GREEN.

  ```bash
  rtk pnpm test:unit --run tests/workspace-palette-quick-pick.test.ts tests/commands.test.ts tests/readme.test.ts tests/use-color-provider.test.ts
  rtk pnpm test:unit --run
  rtk pnpm build
  rtk pnpm test:e2e
  rtk pnpm format:check
  rtk pnpm lint
  pnpm typecheck
  ```

- [x] Commit the complete on-demand user workflow.

  ```bash
  rtk git add src/workspace-palette/quick-pick.ts src/commands/workspace-palette.ts src/commands/index.ts package.json src/meta.ts tests/workspace-palette-quick-pick.test.ts tests/commands.test.ts tests/readme.test.ts tests/e2e/shared.ts
  rtk git commit -m "feat: add workspace palette commands"
  ```

### Task 5: Deterministic CSS, inline-style, and Tailwind contrast pairs

**Files:**

- Create: `src/contrast/types.ts`
- Create: `src/contrast/css-pairs.ts`
- Create: `src/contrast/tailwind-pairs.ts`
- Create: `src/contrast/find-contrast-pairs.ts`
- Modify: `src/strategies/tailwind-theme/utility.ts`
- Modify: `src/strategies/tailwind-theme-colors.ts`
- Create: `tests/css-contrast-pairs.test.ts`
- Create: `tests/tailwind-contrast-pairs.test.ts`
- Create: `tests/find-contrast-pairs.test.ts`
- Modify: `tests/tailwind-theme-colors.test.ts`

**Interfaces:**

- Produce
  `findContrastPairs(text, context): Promise<readonly ResolvedContrastPair[]>`.
- Produce
  `resolveTailwindColorUtilities(text, context?): ResolvedTailwindColorUtility[] | Promise<ResolvedTailwindColorUtility[]>`.
- Extend `TailwindColorUtility` with `variants: readonly string[]`; variants
  before the utility body are retained, CSS pseudo suffixes are not.
- Define `ResolvedContrastColor` with `color`, `originalText`, and exact
  half-open `range`, and define `ResolvedContrastPair` with background,
  foreground, and a stable `contextKey`.

- [x] Add failing CSS scanner tests for one rule's final `color` and
      `background-color`, exact property-value ranges, comments, strings, nested
      functions, `!important`, multiple rules, source order, embedded style blocks,
      quoted inline `style` attributes, case-insensitive properties, and malformed
      block isolation.

- [x] Add rejection tests for `background` shorthand, gradients, images,
      CSS-wide keywords, custom properties, multiple colors in one value, partial
      matches, unknown variables, translucent backgrounds, selectors inheriting
      from other rules, style/script/attribute decoys, and values over the document
      size gate.

- [x] Add failing Tailwind tests for same-class `text-*`/`bg-*`, final utility
      wins, identical `hover:` and `dark:` chains, prefixes/arbitrary variants,
      custom v4 theme colors, configured theme sources, alpha foreground,
      translucent background rejection, exact ranges, and class/className quoting.

- [x] Add Tailwind rejection tests for mixed base/variant contexts, different
      variant chains, font-size `text-*`, gradients, dynamic template expressions,
      malformed arbitrary values, script-string decoys, and ambiguous theme
      aliases.

  ```ts
  expect(
    await findContrastPairs(
      '<div class="dark:bg-black dark:text-white">',
      context('html'),
    ),
  ).toMatchObject([
    {
      variantKey: 'dark',
      background: { color: 'rgb(0, 0, 0)' },
      foreground: { color: 'rgb(255, 255, 255)' },
    },
  ])
  ```

- [x] Run all new pair suites and Tailwind regressions; verify RED.

  ```bash
  rtk pnpm test:unit --run tests/css-contrast-pairs.test.ts tests/tailwind-contrast-pairs.test.ts tests/find-contrast-pairs.test.ts tests/tailwind-theme-colors.test.ts
  ```

- [x] Implement a bounded structural declaration/context scanner. Return only
      complete ranged candidates; keep color resolution out of the syntax scanner.
      Run applicable existing strategies once for the full source and index matches
      by exact range; do not rerun cross-file loaders per declaration. Accept one
      unique match only when it covers the trimmed candidate value after one
      terminal `!important` is removed. For embedded and inline CSS contexts, use a
      CSS strategy context with `namedColorMatchMode: 'always'`; preserve the
      original SCSS/Less/Stylus language context for standalone style documents so
      their variable resolvers remain available.

- [x] Extend the Tailwind utility parser with the pre-body variant chain and
      expose resolved utility metadata from `tailwind-theme-colors.ts`. Keep
      `findTailwindThemeColors` as a projection of the shared resolved result so
      highlight and diagnostics cannot diverge.

  ```ts
  export interface ResolvedTailwindColorUtility {
    readonly color: string
    readonly utility: TailwindColorUtility
  }
  ```

- [x] Parse only static `class`/`className` attribute strings in supported
      markup/component files. Group resolved `bg` and `text` utilities by the exact
      serialized `variants` array; take the final utility per category and create a
      pair only when both categories exist in the same attribute/context.

- [x] Evaluate alpha with Task 1 and filter indeterminate/translucent-background
      pairs. Dedupe pairs by context and exact foreground/background ranges.

- [x] Run focused pair/Tailwind suites, all strategy and snapshot tests, full
      unit tests, benchmark, desktop/Web build, format, lint, and typecheck; verify
      GREEN and bounded linear scanners.

  ```bash
  rtk pnpm test:unit --run tests/css-contrast-pairs.test.ts tests/tailwind-contrast-pairs.test.ts tests/find-contrast-pairs.test.ts tests/tailwind-theme-colors.test.ts tests/playground-snapshot.test.ts
  rtk pnpm test:unit --run
  rtk pnpm bench
  rtk pnpm build
  rtk pnpm format:check
  rtk pnpm lint
  pnpm typecheck
  ```

- [x] Commit the shared deterministic pair engine.

  ```bash
  rtk git add src/contrast src/strategies/tailwind-theme/utility.ts src/strategies/tailwind-theme-colors.ts tests/css-contrast-pairs.test.ts tests/tailwind-contrast-pairs.test.ts tests/find-contrast-pairs.test.ts tests/tailwind-theme-colors.test.ts
  rtk git commit -m "feat: resolve deterministic color contrast pairs"
  ```

### Task 6: Opt-in diagnostics, lifecycle, and code actions

**Files:**

- Create: `src/contrast/diagnostics.ts`
- Create: `src/contrast/code-actions.ts`
- Create: `src/composables/use-contrast-diagnostics.ts`
- Modify: `src/constants/commands.ts`
- Modify: `src/commands/index.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Regenerate: `src/meta.ts`
- Create: `tests/contrast-diagnostics.test.ts`
- Create: `tests/contrast-code-actions.test.ts`
- Create: `tests/use-contrast-diagnostics.test.ts`
- Modify: `tests/commands.test.ts`
- Modify: `tests/readme.test.ts`

**Interfaces:**

- Produce
  `createContrastDiagnosticEntries(document, pairs): ContrastDiagnosticEntry[]`;
  every entry keeps its diagnostic and source pair together.
- Produce `createContrastCodeActionProvider(store): CodeActionProvider`.
- Produce `useContrastDiagnostics(dependencyRevision): void`.
- Add `enableContrastDiagnostics` with default `false`.
- Maintain a versioned `ContrastDiagnosticStore` keyed by URI and exact
  diagnostic range; do not attach unsupported custom fields to VS Code's
  `Diagnostic` object.

- [x] Add failing diagnostic conversion tests for warning severity, exact
      foreground range, background `DiagnosticRelatedInformation`, source name,
      code, exact 4.5 message, two-decimal display, no result at/above 4.5,
      translucent foreground, and exclusion of indeterminate pairs.

- [x] Add failing lifecycle tests for default-off behavior, enabling/disabling,
      existing open documents, open/change/close events, 200 ms debounce,
      cancellation of stale runs, document version races, language/max-size gates,
      dependency revision reruns, per-document error isolation, clearing stale
      diagnostics, collection disposal, timer/token disposal, and Web-compatible
      APIs only.

- [x] Add failing code-action tests for extension-owned diagnostics only,
      `Check these colors`, foreground/background reveal, disable at workspace
      scope, exact store lookups, stale URI/version/range warnings, cancellation,
      and unrelated diagnostic isolation.

- [x] Run the new diagnostics/action/lifecycle suites and metadata contracts;
      verify RED.

  ```bash
  rtk pnpm test:unit --run tests/contrast-diagnostics.test.ts tests/contrast-code-actions.test.ts tests/use-contrast-diagnostics.test.ts tests/commands.test.ts tests/readme.test.ts
  ```

- [x] Add the boolean setting, regenerate metadata, and implement diagnostic
      conversion with source `Better Color Highlight`, code
      `low-color-contrast`, and warning severity. Store each pair separately in the
      `ContrastDiagnosticStore` with the document version used to compute it.

  ```ts
  export interface ContrastDiagnosticEntry {
    readonly diagnostic: Diagnostic
    readonly pair: ResolvedContrastPair
  }
  ```

- [x] Implement the composable with one `DiagnosticCollection` named
      `better-color-highlight`, one timer and `CancellationTokenSource` per URI,
      `workspace.textDocuments` initialization, open/change/close listeners, a
      reactive setting/config watch, and a dependency-revision watch. Check the
      document version immediately before `collection.set`.

  ```ts
  const schedule = (document: TextDocument) => {
    cancelPending(document.uri.toString())
    if (!shouldDiagnose(document)) {
      collection.delete(document.uri)
      return
    }
    timers.set(
      document.uri.toString(),
      setTimeout(() => void diagnoseLatest(document), 200),
    )
  }
  ```

- [x] Register a wildcard code action provider restricted to
      `CodeActionKind.QuickFix`. Register internal reveal/disable commands in
      `useCommands`; invoke Task 4's public contrast command with the serialized
      pair returned by the store. Every command reopens and validates the
      document version, URI, original text, and range before acting. Disable through
      `workspace.getConfiguration('color-highlight').update` with
      `ConfigurationTarget.Workspace`.

- [x] Run focused diagnostics tests, existing composable/command/provider
      suites, full unit tests, benchmark, desktop/Web build, Electron/Web e2e,
      format, lint, and typecheck; verify GREEN.

  ```bash
  rtk pnpm test:unit --run tests/contrast-diagnostics.test.ts tests/contrast-code-actions.test.ts tests/use-contrast-diagnostics.test.ts tests/commands.test.ts tests/use-color-highlight.test.ts tests/use-color-hover.test.ts
  rtk pnpm test:unit --run
  rtk pnpm bench
  rtk pnpm build
  rtk pnpm test:e2e
  rtk pnpm format:check
  rtk pnpm lint
  pnpm typecheck
  ```

- [x] Commit the opt-in diagnostics capability.

  ```bash
  rtk git add src/contrast src/composables/use-contrast-diagnostics.ts src/constants/commands.ts src/commands/index.ts src/index.ts package.json src/meta.ts tests/contrast-diagnostics.test.ts tests/contrast-code-actions.test.ts tests/use-contrast-diagnostics.test.ts tests/commands.test.ts tests/readme.test.ts
  rtk git commit -m "feat: diagnose deterministic color contrast"
  ```

### Task 7: Documentation, full verification, review, and feature commit

**Files:**

- Modify: `README.md`
- Modify: `tests/readme.test.ts`
- Modify: `tests/e2e/suite/index.ts`
- Modify: `tests/e2e/web.ts`
- Modify: `docs/superpowers/plans/2026-07-12-workspace-palette-contrast.md`

**Interfaces:** None.

- [x] Add README contract tests, then document both public commands, exact
      include/exclude defaults, all three hard bounds, scan truncation and
      cancellation, copy/navigation behavior, WCAG thresholds, alpha semantics,
      diagnostics default-off status, supported deterministic contexts, code
      actions, limitations, trust, and Web/virtual-workspace compatibility.

- [x] Extend Electron and Web smoke tests to verify both command IDs are
      registered, enable diagnostics for a tiny fixture, verify one low-contrast
      diagnostic, and restore the setting in `finally` so user/global state is
      never left changed.

- [x] Mark Tasks 1–6 complete only after their independent reviews. Run exact
      full verification in isolation where timing-sensitive scanner tests are not
      competing with builds:

  ```bash
  rtk pnpm format
  rtk pnpm format:check
  rtk pnpm lint
  pnpm typecheck
  rtk pnpm test:unit --run
  rtk pnpm build
  rtk pnpm test:e2e
  rtk pnpm bench
  rtk pnpm audit --prod
  rtk git diff --check
  ```

- [x] Inspect the complete feature diff for generated metadata, command IDs,
      configuration defaults, trust behavior, all read/file bounds, cancellation,
      disposal, stale ranges, diagnostic ownership, palette memory release,
      scanner complexity, bundle contents, Node API absence, snapshots, README
      accuracy, and desktop/Web parity.

- [x] Obtain an independent whole-feature spec and quality review. Fix every
      confirmed P0/P1/P2 issue with a regression test and repeat the review until
      both axes pass.

- [x] Consolidate all implementation/report/fix commits after this plan commit
      into exactly one product commit while retaining the design and plan commits:

  ```bash
  PLAN_COMMIT=$(rtk git rev-list --reverse 0cce79d..HEAD | head -n 1)
  rtk git reset --soft "$PLAN_COMMIT"
  rtk git add -A
  rtk git diff --cached --check
  rtk git commit -m "feat: add workspace palette and contrast diagnostics"
  ```

- [x] Rerun format check, lint, direct typecheck, the isolated full unit suite,
      desktop/Web build, and diff check on the consolidated tree. Verify a clean
      worktree and a single feature commit after the design/plan commits.
