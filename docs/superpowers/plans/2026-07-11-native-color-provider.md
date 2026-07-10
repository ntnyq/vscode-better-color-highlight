# Native Color Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional native VS Code color provider that reuses existing detectors and offers HEX, RGB, HSL, and OKLCH replacements.

**Architecture:** Extract detector execution into a pure core runner used by highlighting and hover. Add a VS Code adapter that validates configuration, converts matches to `ColorInformation`, and converts normalized colors to existing presentation formats. Register the provider once and read configuration at request time.

**Tech Stack:** TypeScript, VS Code Extension API, reactive-vscode, Vitest, pnpm, vscode-ext-gen.

## Global Constraints

- Use pnpm; prefix shell commands with `rtk`, except run `pnpm typecheck` directly.
- Use TDD for every production behavior change.
- Keep the feature disabled by default as `color-highlight.enableColorPicker: false`.
- Preserve desktop, Web, virtual-workspace, cross-file resolver, and cancellation behavior.
- Do not import Node runtime modules from extension source.
- Commit the complete feature as `feat: add native color provider`.

---

### Task 1: Shared detector runner

**Files:**

- Create: `src/core/color-detection.ts`
- Create: `tests/color-detection.test.ts`
- Modify: `src/composables/use-color-highlight.ts`
- Modify: `src/hover/color-hover.ts`

**Interfaces:**

- Produces: `runColorDetectors(options: RunColorDetectorsOptions): Promise<ColorMatch[]>`.
- Consumes: `ColorDetector`, `ColorMatch`, and `StrategyContext`.

- [x] Write a failing test that imports the missing runner, executes two successful detectors and one throwing detector, and asserts flattened matches, one error message, and result callbacks for successful detectors.
- [x] Run `rtk pnpm test:unit --run tests/color-detection.test.ts` and verify RED because the module does not exist.
- [x] Implement `runColorDetectors()` as a `Promise.all` over detectors. Use `detector.name || 'anonymous'`, catch errors per detector, report `Color detector "<name>" failed: <error>`, and return `results.flat()`.
- [x] Replace the detector loops in `use-color-highlight.ts` and `color-hover.ts` with the shared runner while preserving debug logging, error logging, and hover caching.
- [x] Run `rtk pnpm test:unit --run tests/color-detection.test.ts tests/use-color-highlight.test.ts tests/color-hover.test.ts` and verify GREEN.

### Task 2: Picker configuration and generated metadata

**Files:**

- Modify: `package.json`
- Modify: `src/meta.ts` using `pnpm generate:meta`
- Modify: `README.md`
- Modify: `tests/readme.test.ts`

**Interfaces:**

- Produces: `NestedScopedConfigs['enableColorPicker']` and package setting `color-highlight.enableColorPicker`.

- [x] Extend `tests/readme.test.ts` first to assert the package setting exists with default `false` and README contains the heading ``#### `color-highlight.enableColorPicker` ``.
- [x] Run `rtk pnpm test:unit --run tests/readme.test.ts` and verify RED.
- [x] Add the boolean setting after `enableHover` with description: `Use VS Code's native color picker and replacement presentations for detected colors.`
- [x] Run `rtk pnpm generate:meta` and add the generated configuration block to README.
- [x] Rerun the focused test and verify GREEN.

### Task 3: Document color and presentation adapter

**Files:**

- Create: `src/color-provider/document-color-provider.ts`
- Create: `tests/document-color-provider.test.ts`

**Interfaces:**

- Produces:
  - `provideDocumentColors(document, cancellationToken): Promise<ColorInformation[]>`
  - `provideColorPresentations(color, context): ColorPresentation[]`
  - `createColorInformation(document, matches): ColorInformation[]`
- Consumes: `config`, `getStrategies`, `shouldProcessLanguage`, `runColorDetectors`, `parseResolvedColor`, and `getColorPresentationsFromRgba`.

- [x] Create a mocked-VS-Code test that initially fails because the module is missing. Cover disabled picker, one real hex match mapped to normalized channels/range, cancellation, duplicate match removal, invalid resolved-color skipping, and four presentations with replacement edits.
- [x] Run `rtk pnpm test:unit --run tests/document-color-provider.test.ts` and verify RED.
- [x] Implement eligibility checks for `config.enable`, `config.enableColorPicker`, language patterns, maximum text size, and cancellation.
- [x] Build the existing `StrategyContext`, execute applicable strategies through `runColorDetectors()`, log detector errors, and recheck cancellation.
- [x] Implement deduplicated `ColorInformation` conversion using `document.positionAt()` and normalized RGBA channels.
- [x] Implement presentations in the fixed order `hex`, `rgb`, `hsl`, `oklch`, assigning `TextEdit.replace(context.range, value)` to each result.
- [x] Rerun the provider test and verify GREEN.

### Task 4: Provider lifecycle registration

**Files:**

- Create: `src/composables/use-color-provider.ts`
- Create: `tests/use-color-provider.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Produces: `useColorProvider(): void`.
- Consumes: document provider functions from Task 3.

- [x] Write a failing test with mocked `languages.registerColorProvider` and `onDeactivate`. Assert selector `'*'`, provider method identity, and disposal on deactivation.
- [x] Run `rtk pnpm test:unit --run tests/use-color-provider.test.ts` and verify RED.
- [x] Implement the composable, register once, dispose on deactivation, and call it from `src/index.ts`.
- [x] Rerun the lifecycle and provider tests and verify GREEN.

### Task 5: Verification and feature commit

**Files:**

- Modify: `docs/superpowers/plans/2026-07-11-native-color-provider.md` to mark all steps complete.

**Interfaces:** None.

- [x] Run `rtk pnpm format`, `rtk pnpm format:check`, `rtk pnpm lint`, `pnpm typecheck`, `rtk pnpm test:unit --run`, `rtk pnpm build`, `rtk pnpm test:e2e`, `rtk pnpm bench`, and `rtk git diff --check`.
- [x] Review the complete diff and confirm no unrelated runtime, configuration, snapshot, or dependency changes.
- [x] Stage the plan, provider, shared runner, configuration, generated metadata, README, tests, and integration files.
- [x] Commit as `feat: add native color provider`.
