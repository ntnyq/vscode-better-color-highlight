# Contextual Color Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve color variables conservatively from their source context and provide precise VS Code definition links for CSS, SCSS, Less, Stylus, and DTCG references.

**Architecture:** Ranged syntax collectors feed language-specific pure definition resolvers, all returning one `ColorDefinitionTarget` shape. A thin VS Code provider applies configuration, trust, cancellation, and file-size gates and converts offsets to `LocationLink`; highlighting and navigation share the same candidate-selection and dependency-loading logic.

**Tech Stack:** TypeScript, reactive-vscode, VS Code DefinitionProvider API, Workspace FS, Vitest, tsdown, pnpm.

## Global Constraints

- Use pnpm; prefix shell commands with `rtk`, except `pnpm typecheck`.
- Use RED→GREEN TDD for production behavior.
- Add `color-highlight.enableColorNavigation` with default `true`.
- Navigate only references whose final value resolves to a supported color.
- Return no result for missing, cyclic, ambiguous, malformed, oversized, cancelled, or non-color references.
- Cross-file CSS, SCSS, and DTCG navigation must reuse their existing settings, trust gates, bounds, Workspace FS reads, and open-document versions.
- Preserve desktop, Web, virtual-workspace, highlight, hover, and native provider behavior.
- Commit the complete implementation as `feat: add contextual color navigation`.

---

### Task 1: Shared navigation types and contextual CSS selection

**Files:**

- Create: `src/types/color-navigation.ts`
- Modify: `src/types/index.ts`
- Modify: `src/strategies/css-vars/parser.ts`
- Modify: `src/strategies/css-vars/resolver.ts`
- Modify: `src/strategies/css-vars/index.ts`
- Modify: `tests/css-vars.test.ts`
- Create: `tests/css-var-definition.test.ts`

**Interfaces:**

- Produce `ColorSourceRange` and `ColorDefinitionTarget`.
- Extend `CssVarDeclaration` with `nameRange` and `valueRange`.
- Produce `findCssVarUsages(text): CssVarUsage[]` with name/origin ranges and source context.
- Produce `resolveCssVarDefinition(text, offset, options): Promise<ColorDefinitionTarget | null>`.
- Export one `selectCssVarDeclaration()` used by highlighting and navigation.

- [x] Add failing parser and resolver tests for declaration ranges, usage ranges, exact selector/at-rule matches, identical-context latest-wins selection, unique global fallback, ambiguous contexts, cycles, fallbacks, and non-color variables.

```ts
expect(
  await resolveCssVarDefinition(
    text,
    text.indexOf('var(--brand)') + 6,
    options,
  ),
).toMatchObject({
  originRange: {
    start: text.indexOf('var(--brand)'),
    end: text.indexOf('var(--brand)') + 12,
  },
  targetSelectionRange: rangeOf(text, '--brand', 0),
})
```

- [x] Run `rtk pnpm test:unit --run tests/css-vars.test.ts tests/css-var-definition.test.ts` and verify the new range/context assertions fail.
- [x] Track absolute offsets while scanning declaration segments; retain normalized selector and at-rule context without using regex offsets derived from rewritten text.
- [x] Collect the enclosing selector/at-rule stack for each `var(...)` usage and make name, call, and context metadata public.
- [x] Update candidate selection to prefer an exact usage context, then preserve the existing one-context/trusted external fallback. Use this same selector from color resolution and definition resolution.
- [x] Resolve the selected alias chain to a color before returning its declaration file/name ranges; preserve fallback, cycle, ambiguity, and external-source behavior.
- [x] Run focused CSS parser, resolver, cache, and source tests and verify GREEN.

### Task 2: Ranged SCSS, Less, and Stylus definition resolution

**Files:**

- Create: `src/strategies/shared/variable-definition.ts`
- Modify: `src/strategies/scss-vars.ts`
- Modify: `src/strategies/less-vars.ts`
- Modify: `src/strategies/stylus-vars.ts`
- Create: `tests/scss-definition.test.ts`
- Create: `tests/less-definition.test.ts`
- Create: `tests/stylus-definition.test.ts`
- Modify: `tests/scss-vars.test.ts`
- Modify: `tests/scss-vars-cache.test.ts`
- Modify: `tests/less-vars.test.ts`
- Modify: `tests/stylus-vars.test.ts`

**Interfaces:**

- Produce `RangedVariableDefinition` with `name`, `value`, `filePath`, `nameRange`, and `valueRange`.
- Produce `resolveScssVarDefinition`, `resolveLessVarDefinition`, and `resolveStylusVarDefinition`.
- Preserve the public `findScssVars`, `findLessVars`, and `findStylusVars` detector contracts.

- [x] Add failing local tests for direct values, chained aliases, last-definition-wins behavior, definition-token exclusion, missing/non-color values, and cycles in all three syntaxes.
- [x] Add failing SCSS tests for default namespace, explicit namespace, `as *`, `@import`, `@forward`, partial/index lookup, load paths, untrusted/disabled reads, unsaved dependency text, and cross-file cycles.

```ts
expect(
  await resolveScssVarDefinition(entry, usageOffset, trustedContext),
).toMatchObject({
  targetFilePath: '/workspace/_tokens.scss',
  targetSelectionRange: {
    start: dependency.indexOf('$brand'),
    end: dependency.indexOf('$brand') + 6,
  },
})
```

- [x] Run the new definition suites and verify missing-export/implementation RED states.
- [x] Introduce the shared ranged definition type and adapt each local collector to retain exact name/value offsets while keeping existing detector output unchanged.
- [x] Refactor SCSS module maps to retain ranged definitions alongside raw values; share the current bounded module resolution, forwarding, caching, and Workspace FS reads with navigation.
- [x] Resolve the reference under the requested offset through the same visibility and alias rules used by the detectors, verify the chain is color-valued, and return the final declaration target.
- [x] Run all SCSS/Less/Stylus detector, cache, definition, workspace-path, and playground snapshot tests and verify GREEN.

### Task 3: DTCG alias definition resolution

**Files:**

- Modify: `src/strategies/design-tokens/types.ts`
- Modify: `src/strategies/design-tokens/json-document.ts`
- Modify: `src/strategies/design-tokens/yaml-document.ts`
- Modify: `src/strategies/design-tokens/resolver.ts`
- Modify: `src/strategies/design-tokens/external-loader.ts`
- Create: `src/strategies/design-tokens/definition.ts`
- Create: `tests/design-token-definition.test.ts`
- Modify: `tests/design-token-resolver.test.ts`
- Modify: `tests/design-token-external-loader.test.ts`

**Interfaces:**

- Extend `DesignTokenEntry` with `definitionRange`.
- Produce `resolveDesignTokenDefinition(document, offset, options?): ColorDefinitionTarget | Promise<ColorDefinitionTarget | null> | null`.
- Reuse one reference parser/path index for color and navigation resolution.

- [x] Add failing JSON/JSONC/YAML tests for curly aliases, chained aliases, local `$ref`, escaped JSON Pointer segments, `$root`, external JSON↔YAML targets, exact target-name ranges, missing/type mismatch/cycles, relative-only policy, trust/setting gates, 512 KiB limit, and version-aware cache invalidation.
- [x] Run `rtk pnpm test:unit --run tests/design-token-definition.test.ts tests/design-token-resolver.test.ts tests/design-token-external-loader.test.ts` and verify RED.
- [x] Capture token-name ranges in both AST walkers, including group `$root` tokens, without changing existing highlighted value ranges.
- [x] Extract shared curly-reference, pointer, path-index, type-merge, cycle-key, and external-document loading primitives from the current resolvers.
- [x] Resolve only aliases whose final target is a valid color token; return the referenced token's file path and definition range.
- [x] Run all DTCG, JSON, YAML, external-loader, registry, and snapshot suites and verify GREEN.

### Task 4: Unified dispatcher and VS Code DefinitionProvider

**Files:**

- Create: `src/color-navigation/resolve-color-definition.ts`
- Create: `src/color-navigation/definition-provider.ts`
- Create: `src/composables/use-color-navigation.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Regenerate: `src/meta.ts`
- Modify: `src/types/highlight-run.ts` only if the generated configuration type requires it
- Create: `tests/resolve-color-definition.test.ts`
- Create: `tests/definition-provider.test.ts`
- Create: `tests/use-color-navigation.test.ts`
- Modify: `tests/readme.test.ts`

**Interfaces:**

- Produce `resolveColorDefinition(text, offset, context): Promise<ColorDefinitionTarget | null>`.
- Produce `provideColorDefinition(document, position, cancellationToken): Promise<LocationLink[] | undefined>`.
- Produce `useColorNavigation(): void`.

- [x] Add the failing dispatch tests for every supported language ID and unsupported modes.
- [x] Add provider tests for enable/navigation/language/max-size/trust gates, cancellation before and after resolution, same-file and cross-file target documents, precise `LocationLink` ranges, target open failures, and error logging.
- [x] Add composable tests proving registration for CSS, SCSS, Less, Stylus, JSON, JSONC, YAML, and YML selectors and deactivation disposal.
- [x] Run focused suites and verify missing-module RED states.
- [x] Dispatch to language resolvers with the complete existing strategy context and isolate resolver errors as no-result plus a log entry.
- [x] Add `color-highlight.enableColorNavigation` default `true`, regenerate metadata, register the provider during extension activation, and honor `config.enable`, configured languages, `maxFileSize`, and cancellation.
- [x] Convert source/target offsets using current and opened target documents into `LocationLink` objects; avoid opening a second document for same-file links.
- [x] Run provider, composable, command, highlight, hover, native provider, metadata, and README tests and verify GREEN.

### Task 5: Documentation, full verification, and commit

**Files:**

- Modify: `README.md`
- Modify: `tests/readme.test.ts`
- Modify: `docs/superpowers/plans/2026-07-11-contextual-color-navigation.md`

**Interfaces:** None.

- [x] Document contextual CSS selection, supported navigation syntaxes, opt-out setting, ambiguity behavior, and trusted cross-file gates.
- [x] Update generated-config and README contract tests for `enableColorNavigation: true`.
- [x] Run `rtk pnpm format`, `rtk pnpm format:check`, `rtk pnpm lint`, `pnpm typecheck`, `rtk pnpm test:unit --run`, `rtk pnpm build`, `rtk pnpm test:e2e`, `rtk pnpm bench`, `rtk pnpm audit --prod`, and staged `rtk proxy git diff --check`.
- [x] Review all runtime, parser, dependency, generated metadata, snapshot, provider, documentation, and Web-bundle diffs.
- [x] Stage the complete phase and commit `feat: add contextual color navigation`.
