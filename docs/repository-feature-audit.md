# Repository Feature Audit

Date: 2026-07-17

## Executive Summary

The repository's documented user-facing feature set is implemented. The audit
found all 13 public commands and all 28 public settings declared in generated
metadata (`src/meta.ts:15-28`, `src/meta.ts:104-132`), registered or consumed by
runtime code, and covered by focused tests or the playground snapshot suite.
No documented feature was found to exist only as prose with no implementation.

Two superficially unfinished-looking signals remain, but neither is a real
missing feature:

1. Five `TODO`/`FIXME` comments occur in `playground/index.ts:148-150` and
   `playground/css.css:354-355`. Their surrounding headings explicitly say that
   colors in comments should be highlighted (`playground/index.ts:144-150`,
   `playground/css.css:353-355`), and the expected matches are committed in the
   corresponding snapshots. They are test fixtures, not engineering tasks.
2. Design documents have explicit **Non-Goals** sections. These are deliberate
   product boundaries, not promises for future implementation.

After the audit, completed implementation plans were removed and the design
records were moved to `docs/design/`. Each retained record now identifies its
implementation date and commit and states that it is historical, not a
roadmap.

Fresh verification for this audit ran the repository-local Vitest binary:
**63 test files and 890 tests passed**. The repository-local type checker,
linter, formatter check, and build also passed. The Electron/Web extension-host
suites were inspected but not rerun.

## Scope and Method

The audit used only tracked, first-party repository material:

- public documentation: `README.md` and `docs/design/**`;
- extension contract: `package.json` and generated `src/meta.ts`;
- implementation: `src/**`;
- verification evidence: `tests/**`, `benchmarks/**`, `playground/**`, and
  `.github/workflows/**`.

The comparison followed each promise from documentation or extension metadata
to its runtime registration/implementation and then to focused tests or an
intentional playground snapshot. Generated `.vscode-test` runtime data and
dependency lockfile text were not treated as product documentation. There is no
tracked `CHANGELOG`, standalone roadmap, or GitHub issue/pull-request template
in the repository; `.github/` contains Renovate configuration and workflows
only.

Status meanings used below:

- **Implemented**: runtime path exists and is registered/wired.
- **Implemented, bounded by design**: implementation intentionally declines
  ambiguous, unsafe, dynamic, or over-limit cases documented by the feature.
- **Documentation state only**: a checklist or wording issue that does not
  represent missing runtime behavior.

## Public Feature Promises

### Highlighting and supported color syntax

| Documented promise                                                                                                                                                                        | Implementation evidence                                                                                                                                                                                                                                                    | Verification evidence                                                                                                                                                                                   | Status                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Highlight colors in code, comments, and strings (`README.md:8`)                                                                                                                           | The highlight pipeline scans complete document text, chooses strategies, groups results, and applies decorations (`src/composables/use-color-highlight.ts:281-444`).                                                                                                       | Comment fixtures are intentionally included at `playground/index.ts:144-150` and `playground/css.css:353-359`; all playground files are snapshot-tested at `tests/playground-snapshot.test.ts:188-202`. | Implemented                    |
| Enable/disable, language include/exclude patterns, maximum file size, debouncing, stale-result rejection, and debug logging (`README.md:36-46`, `README.md:126-130`, `README.md:198-202`) | Language pattern semantics are implemented in `src/core/strategy-registry.ts:47-64`; size, language, enable, stale-result, and debug gates are in `src/composables/use-color-highlight.ts:290-448`.                                                                        | The extension-host scenario asserts real in-memory CSS highlighting at `tests/e2e/shared.ts:62-83`; focused lifecycle/config coverage is in `tests/use-color-highlight.test.ts`.                        | Implemented                    |
| Hex forms, including RGBA/ARGB mode, while rejecting short numeric `0xabc`/`0xabcd` false positives (`README.md:156-160`, `README.md:277`, `README.md:485`)                               | Both byte orders and the short-`0x` guard are implemented in `src/strategies/hex.ts:9-20` and `src/strategies/hex.ts:49-135`.                                                                                                                                              | `tests/hex.test.ts:5-65` covers short/long forms, RGBA, ARGB, and the false-positive guard.                                                                                                             | Implemented                    |
| `rgb()`/`rgba()`, `hsl()`/`hsla()`, Lab/LCH, OKLab/OKLCH, slash alpha, and CSS `color()` spaces (`README.md:278-283`)                                                                     | The supported function and color-space expressions are declared and converted in `src/strategies/color-functions.ts:14-44` and `src/strategies/color-functions.ts:120-194`.                                                                                                | `tests/color-functions.test.ts:5-163` covers the documented families, whitespace syntax, percentages, and slash alpha.                                                                                  | Implemented                    |
| `hwb()` (`README.md:280`)                                                                                                                                                                 | Comma and whitespace forms, angle units, and alpha are parsed in `src/strategies/hwb.ts:4-55`.                                                                                                                                                                             | `tests/hwb.test.ts:5-37`.                                                                                                                                                                               | Implemented                    |
| Named CSS colors with contextual/always/never matching (`README.md:48-58`, `README.md:284`, `README.md:489`)                                                                              | Registration gates are in `src/core/strategy-registry.ts:149-156`; syntax-aware filtering is in `src/strategies/named-colors.ts`.                                                                                                                                          | `tests/named-colors.test.ts:5-115` covers names, selectors, at-rules, variables, and permissive mode.                                                                                                   | Implemented, bounded by design |
| CSS custom properties and SCSS/Less/Stylus variables (`README.md:285`)                                                                                                                    | Language-specific strategy dispatch is in `src/core/strategy-registry.ts:176-190`; implementations live in `src/strategies/css-vars/`, `src/strategies/scss-vars.ts`, `src/strategies/less-vars.ts`, and `src/strategies/stylus-vars.ts`.                                  | `tests/css-vars.test.ts:289-396`, `tests/scss-vars.test.ts:55-113`, `tests/less-vars.test.ts:6-83`, and `tests/stylus-vars.test.ts`.                                                                    | Implemented                    |
| Conservative cross-file CSS variables from configured sources and trusted selectors (`README.md:368-372`)                                                                                 | Opt-in/trust gates and source loading are in `src/strategies/css-vars/index.ts:35-62`; the loader enforces 64 files and 512 KiB per file (`src/strategies/css-vars/sources.ts:17-21`, `src/strategies/css-vars/sources.ts:47-86`).                                         | Context, ambiguity, and external-source behavior are covered by `tests/css-vars.test.ts:318-396`, `tests/css-vars-cache.test.ts`, and `tests/css-var-definition.test.ts:47-199`.                        | Implemented, bounded by design |
| Opt-in SCSS `@use`, `@forward`, `@import`, partial/index, nearest `node_modules`, and configured load-path resolution (`README.md:96-106`, `README.md:493-494`)                           | Directives and 5-depth/32-file/512-KiB bounds are defined at `src/strategies/scss-vars.ts:35-76`; partial/index candidates and package/load paths are implemented at `src/strategies/scss-vars.ts:320-429`; detection uses them at `src/strategies/scss-vars.ts:971-1044`. | `tests/scss-vars.test.ts:113-296`, `tests/scss-vars-cache.test.ts`, and `tests/scss-definition.test.ts:152-401`.                                                                                        | Implemented, bounded by design |
| Optional bare RGB/HSL triplets and `--color-rgb`-style shorthands (`README.md:162-184`, `README.md:286`)                                                                                  | Conditional bare-value strategies are selected at `src/core/strategy-registry.ts:158-174`; CSS property shorthands are parsed at `src/strategies/color-functions.ts:38-49` and `src/strategies/color-functions.ts:164-192`.                                                | `tests/rgb-no-fn.test.ts:5-20`, `tests/hsl-no-fn.test.ts:5-15`, and `tests/color-functions.test.ts:110-133`.                                                                                            | Implemented                    |
| Flutter/Dart `Color(0xAARRGGBB)` and `Color.fromARGB(...)` (`README.md:288`, `README.md:486`)                                                                                             | `src/strategies/dart-colors.ts:4-73`; dispatch at `src/core/strategy-registry.ts:193-195`.                                                                                                                                                                                 | `tests/dart-colors.test.ts:47-60`.                                                                                                                                                                      | Implemented                    |
| Hyprland `rgba(rrggbb)` / `rgba(rrggbbaa)` (`README.md:289`, `README.md:487`)                                                                                                             | `src/strategies/color-functions.ts:32-36` and `src/strategies/color-functions.ts:197-229`.                                                                                                                                                                                 | `tests/color-functions.test.ts:41-53`.                                                                                                                                                                  | Implemented                    |
| Transparent values remain visible through opaque marker rendering while preserving the represented color (`README.md:488`)                                                                | Display color conversion occurs before marker styling in `src/decorations/marker-types.ts:17-34`; six marker styles and ruler output are implemented at `src/decorations/marker-types.ts:31-78`.                                                                           | `tests/marker-types.test.ts`.                                                                                                                                                                           | Implemented                    |

### Tailwind themes and utilities

| Documented promise                                                                                                                                                                  | Implementation evidence                                                                                                                                                                                                                                     | Verification evidence                                                                                                                             | Status                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Bundled v3/v4 palettes with `auto`, `v3`, and `v4` selection (`README.md:293-309`)                                                                                                  | Mode normalization and shared theme resolution are in `src/strategies/tailwind-theme-colors.ts:42-62` and `src/strategies/tailwind-theme/resolver.ts:50-107`; separate v3/v4 palette modules are present.                                                   | `tests/tailwind-palette.test.ts:5-34` and `tests/tailwind-theme-colors.test.ts:71-103`.                                                           | Implemented                    |
| Top-level `@theme`, `@theme inline`, `@theme static`, ordered overrides, resets, exact aliases, and conservative property resolution (`README.md:311-319`)                          | Structural parsing recognizes all three forms at `src/strategies/tailwind-theme/parser.ts:71-119` and `src/strategies/tailwind-theme/parser.ts:425-434`; reset/alias semantics are in `src/strategies/tailwind-theme/resolver.ts:47-151`.                   | `tests/tailwind-theme-parser.test.ts:13-314` and `tests/tailwind-theme-resolver.test.ts:26-206`.                                                  | Implemented, bounded by design |
| Trusted file/directory/glob theme sources; relative `@import`/`@reference`; 32 files, depth 5, 512 KiB; no package/remote/code execution (`README.md:321-342`, `README.md:362-366`) | Trust and configured-path gates plus exact bounds are in `src/strategies/tailwind-theme/sources.ts:22-78`; traversal restrictions are in `src/strategies/tailwind-theme/sources.ts:81-179`.                                                                 | `tests/tailwind-theme-sources.test.ts:66-528` covers trust, expansion, imports, unsafe dependencies, limits, cancellation, and unsaved documents. | Implemented, bounded by design |
| Named utilities, variants, gradients/SVG/border/ring/shadow groups, slash opacity, both important forms, arbitrary colors, and custom-property shorthand (`README.md:344-352`)      | The complete utility prefix set and structural token parser are in `src/strategies/tailwind-theme/utility.ts:1-85` and `src/strategies/tailwind-theme/utility.ts:141-249`; color/opacity resolution is in `src/strategies/tailwind-theme-colors.ts:85-145`. | `tests/tailwind-theme-colors.test.ts:103-324`.                                                                                                    | Implemented, bounded by design |
| Tailwind Go/Peek Definition links only for resolvable custom declarations (`README.md:354-360`)                                                                                     | `src/strategies/tailwind-theme/definition.ts:12-64` is invoked before language-specific variable resolution at `src/color-navigation/resolve-color-definition.ts:24-33`.                                                                                    | `tests/tailwind-definition.test.ts:32-154` and `tests/tailwind-definition-sources.test.ts:67-178`.                                                | Implemented, bounded by design |

### Design tokens

| Documented promise                                                                                                                      | Implementation evidence                                                                                                                                                                                                                                                                                                                                                              | Verification evidence                                                                                                                                           | Status                         |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| JSON/JSONC/JSON-formatted `.tokens` modes `token-values`, `strings`, `all`, and `off` (`README.md:144-154`, `README.md:374-385`)        | Mode selection and legacy/structured matching are implemented in `src/strategies/json-design-tokens.ts:17-111`; `.tokens` dispatch is recognized in `src/core/strategy-registry.ts:72-77`.                                                                                                                                                                                           | `tests/json-design-tokens.test.ts:81-292` covers every mode, token fields, broad strings, comments, and malformed input.                                        | Implemented                    |
| DTCG structured colors in all 14 color spaces, alpha, inherited types, curly aliases, local pointers, and `$root` (`README.md:387-403`) | Eight RGB-like plus six semantic spaces are implemented in `src/strategies/design-tokens/color.ts:14-23` and `src/strategies/design-tokens/color.ts:92-188`; JSON/YAML AST adapters and the shared depth-32 resolver are in `src/strategies/design-tokens/json-document.ts`, `src/strategies/design-tokens/yaml-document.ts`, and `src/strategies/design-tokens/resolver.ts:31-205`. | `tests/dtcg-color.test.ts:27-116`, `tests/json-design-tokens.test.ts:5-81`, `tests/yaml-design-tokens.test.ts`, and `tests/design-token-resolver.test.ts`.      | Implemented, bounded by design |
| YAML design tokens, but not arbitrary YAML string matching (`README.md:291`, `README.md:384-385`)                                       | YAML intentionally uses semantic token detection only (`src/strategies/yaml-design-tokens.ts:6-53`) and is selected for YAML/YML at `src/core/strategy-registry.ts:80-82` and `src/core/strategy-registry.ts:143-146`.                                                                                                                                                               | `tests/yaml-design-tokens.test.ts` and the committed `playground/tokens.yaml` snapshot.                                                                         | Implemented, bounded by design |
| Opt-in trusted relative cross-file JSON/JSONC/`.tokens`/YAML `$ref`, limited to 64 files of 512 KiB (`README.md:405-420`)               | Trust gating is in `src/strategies/json-design-tokens.ts:114-121` and `src/strategies/yaml-design-tokens.ts:42-51`; limits and loaders are in `src/strategies/design-tokens/external-loader.ts:45-58`.                                                                                                                                                                               | `tests/design-token-external-loader.test.ts:44-373` covers trust, cross-format references, bounds, cycles, size, cancellation, cache invalidation, and `$root`. | Implemented, bounded by design |

### User workflows and editor integrations

| Documented promise                                                                                                                                                                                | Implementation evidence                                                                                                                                                                                                                                                                                                                                                               | Verification evidence                                                                                                                                                                                                                                                                   | Status                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Optional hover details with HEX/RGB/HSL/OKLCH copy and replace icons plus ±10 percentage-point alpha actions (`README.md:60-64`, `README.md:463-465`)                                             | Hover lookup/presentations and markdown links are in `src/hover/color-hover.ts:149-237` and `src/hover/color-hover.ts:257-390`; provider registration is in `src/composables/use-color-hover.ts:16-81`.                                                                                                                                                                               | `tests/color-hover.test.ts:205-301`.                                                                                                                                                                                                                                                    | Implemented                                                        |
| Copy, replace, and alpha commands validate document/range/source and preserve HEX case (`README.md:18-26`; design contract at `docs/design/2026-07-07-hover-color-actions-design.md:111-170`)     | All handlers are registered at `src/commands/index.ts:27-44`; replacement and alpha logic are in `src/commands/replace-color.ts:12-27`, `src/commands/adjust-color-alpha.ts:16-36`, and the shared range validator.                                                                                                                                                                   | `tests/commands.test.ts:385-536` covers clipboard, active-editor lookup, wrong/stale document ranges, case preservation, alpha clamping, and source format.                                                                                                                             | Implemented                                                        |
| Optional native VS Code color picker with four replacement presentations (`README.md:66-70`, `README.md:467-470`)                                                                                 | Detection, normalization, deduplication, and presentations are in `src/color-provider/document-color-provider.ts:36-153`; lifecycle registration is in `src/composables/use-color-provider.ts:8-19`.                                                                                                                                                                                  | `tests/document-color-provider.test.ts:148-242` and `tests/use-color-provider.test.ts`.                                                                                                                                                                                                 | Implemented                                                        |
| Go to Definition / Peek Definition for CSS, SCSS, Less, Stylus, DTCG aliases/refs, and Tailwind custom colors, with conservative context and trust gates (`README.md:78-82`, `README.md:422-460`) | The dispatcher covers CSS/SCSS/Less/Stylus/JSON/YAML and Tailwind at `src/color-navigation/resolve-color-definition.ts:18-79`; provider/config/trust gates are in `src/color-navigation/definition-provider.ts:14-89`; registration is in `src/composables/use-color-navigation.ts:7-16`.                                                                                             | Focused definition suites cover CSS (`tests/css-var-definition.test.ts:27-199`), SCSS (`tests/scss-definition.test.ts:75-401`), Less, Stylus, DTCG (`tests/design-token-definition.test.ts:116-535`), Tailwind, and the VS Code provider (`tests/definition-provider.test.ts:131-334`). | Implemented, bounded by design                                     |
| On-demand cancellable workspace palette with deterministic grouping, bounded scanning, copy actions, exact-source navigation, truncation disclosure, and no retained index (`README.md:206-233`)  | All documented limits are constants at `src/workspace-palette/scanner.ts:13-20`; deterministic/cancellable scanning and retention are at `src/workspace-palette/scanner.ts:75-225`; ephemeral Quick Pick copy/navigation behavior is at `src/workspace-palette/quick-pick.ts:66-108` and `src/workspace-palette/quick-pick.ts:242-315`.                                               | `tests/workspace-palette-scanner.test.ts:126-595`, `tests/workspace-palette-model.test.ts`, and `tests/workspace-palette-quick-pick.test.ts:274-624`.                                                                                                                                   | Implemented, bounded by design                                     |
| Manual WCAG 2.2 contrast comparison, unrounded pass/fail, translucent foreground compositing, and indeterminate translucent backgrounds (`README.md:235-241`)                                     | Thresholds and compositing are implemented at `src/contrast/evaluate.ts:9-43`; interaction/result rendering is in `src/workspace-palette/quick-pick.ts:127-239`.                                                                                                                                                                                                                      | `tests/contrast-evaluation.test.ts:17-139` and workspace Quick Pick tests.                                                                                                                                                                                                              | Implemented, bounded by design                                     |
| Opt-in deterministic contrast diagnostics for same-rule CSS, static inline styles, and same-variant Tailwind pairs, plus four stale-safe Quick Fixes (`README.md:243-264`)                        | Pair dispatch is at `src/contrast/find-contrast-pairs.ts:8-47`; CSS/static-markup and Tailwind resolvers are in `src/contrast/css-pairs.ts` and `src/contrast/tailwind-pairs.ts`; warnings and four actions are in `src/contrast/diagnostics.ts:66-104` and `src/contrast/code-actions.ts:26-80`; open-document lifecycle is in `src/composables/use-contrast-diagnostics.ts:23-241`. | `tests/css-contrast-pairs.test.ts:10-310`, `tests/tailwind-contrast-pairs.test.ts:10-346`, `tests/contrast-diagnostics.test.ts:98-133`, `tests/contrast-code-actions.test.ts:81-131`, and `tests/use-contrast-diagnostics.test.ts`.                                                     | Implemented, bounded by design                                     |
| Desktop, Web, virtual-workspace, and untrusted-workspace support without Node filesystem APIs in extension runtime (`README.md:266-271`, `README.md:362-366`)                                     | Desktop and browser bundle entries are declared at `package.json:55-57`; capabilities are declared at `package.json:390-404`; cross-file settings are restricted in untrusted workspaces at `package.json:393-400`; runtime paths use the VS Code Workspace FS adapter in `src/utils/workspace-file-system.ts`.                                                                       | Shared desktop/Web runtime assertions are in `tests/e2e/shared.ts:37-140`, consumed by Web at `tests/e2e/web.ts:1-12` and Electron at `tests/e2e/suite/index.ts:38-77`; Workspace FS behavior is unit-tested in `tests/workspace-file-system.test.ts`.                                  | Implemented; extension-host suites not freshly rerun in this audit |

## Commands and Settings Contract

### Commands

`README.md:14-28`, `package.json:313-378`, and generated
`src/meta.ts:15-98` agree on the same 13 public commands:

| Commands                                                                             | Runtime registration          | Status      |
| ------------------------------------------------------------------------------------ | ----------------------------- | ----------- |
| `enable`, `disable`                                                                  | `src/commands/index.ts:23-25` | Implemented |
| `copyColorAsHex`, `copyColorAsRgb`, `copyColorAsHsl`, `copyColorAsOklch`             | `src/commands/index.ts:27-30` | Implemented |
| `replaceColorAsHex`, `replaceColorAsRgb`, `replaceColorAsHsl`, `replaceColorAsOklch` | `src/commands/index.ts:32-43` | Implemented |
| `adjustColorAlpha`                                                                   | `src/commands/index.ts:44`    | Implemented |
| `showWorkspacePalette`                                                               | `src/commands/index.ts:45`    | Implemented |
| `checkColorContrast`                                                                 | `src/commands/index.ts:46-48` | Implemented |

Command registration and behavior are tested at `tests/commands.test.ts:174-536`;
the extension-host scenario additionally checks the main public command set at
`tests/e2e/shared.ts:18-59`.

### Settings

The generated setting union at `src/meta.ts:104-132` matches the 28 settings
documented at `README.md:32-204`. Each setting has a runtime consumer:

| Setting                           | Principal consumer                                                                                          | Status      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| `enable`                          | highlight/provider/hover/navigation/diagnostic gates; e.g. `src/composables/use-color-highlight.ts:365-374` | Implemented |
| `languages`                       | `src/core/strategy-registry.ts:206-210` and all providers                                                   | Implemented |
| `matchWords`                      | `src/core/strategy-registry.ts:149-156`                                                                     | Implemented |
| `namedColorMatchMode`             | registry and named-color context; `src/core/strategy-registry.ts:149-156`                                   | Implemented |
| `enableHover`                     | `src/composables/use-color-hover.ts:20-27`                                                                  | Implemented |
| `enableColorPicker`               | `src/color-provider/document-color-provider.ts:40-47`                                                       | Implemented |
| `enableContrastDiagnostics`       | `src/composables/use-contrast-diagnostics.ts:182-189`                                                       | Implemented |
| `enableColorNavigation`           | `src/color-navigation/definition-provider.ts:20-27`                                                         | Implemented |
| `tailwindColorMode`               | `src/strategies/tailwind-theme-colors.ts:147-156`                                                           | Implemented |
| `tailwindStylesheetPaths`         | `src/strategies/tailwind-theme-colors.ts:159-164`                                                           | Implemented |
| `resolveScssVariablesAcrossFiles` | `src/strategies/scss-vars.ts:385-395`                                                                       | Implemented |
| `scssLoadPaths`                   | `src/strategies/scss-vars.ts:367-429`                                                                       | Implemented |
| `resolveCssVariablesAcrossFiles`  | `src/strategies/css-vars/index.ts:44-57`                                                                    | Implemented |
| `cssVariablePaths`                | `src/strategies/css-vars/index.ts:48-56`                                                                    | Implemented |
| `cssVariableTrustedSelectors`     | `src/strategies/css-vars/index.ts:48-56`                                                                    | Implemented |
| `maxFileSize`                     | `src/composables/use-color-highlight.ts:342-351` and other providers                                        | Implemented |
| `workspacePaletteInclude`         | `src/workspace-palette/scanner.ts:82-86`                                                                    | Implemented |
| `workspacePaletteExclude`         | `src/workspace-palette/scanner.ts:82-86`                                                                    | Implemented |
| `designTokenJsonMode`             | `src/strategies/json-design-tokens.ts:35-38` and registry YAML/JSON gates                                   | Implemented |
| `resolveDesignTokensAcrossFiles`  | `src/strategies/json-design-tokens.ts:114-121`, `src/strategies/yaml-design-tokens.ts:42-51`                | Implemented |
| `useARGB`                         | `src/core/strategy-registry.ts:100-105`                                                                     | Implemented |
| `matchRgbWithNoFunction`          | `src/core/strategy-registry.ts:158-165`                                                                     | Implemented |
| `rgbWithNoFunctionLanguages`      | `src/core/strategy-registry.ts:158-165`                                                                     | Implemented |
| `matchHslWithNoFunction`          | `src/core/strategy-registry.ts:167-174`                                                                     | Implemented |
| `hslWithNoFunctionLanguages`      | `src/core/strategy-registry.ts:167-174`                                                                     | Implemented |
| `markerType`                      | `src/composables/use-color-highlight.ts:437-444`, `src/decorations/marker-types.ts:31-76`                   | Implemented |
| `markRuler`                       | `src/decorations/marker-types.ts:26-29`                                                                     | Implemented |
| `debug`                           | `src/composables/use-color-highlight.ts:321-428`                                                            | Implemented |

Metadata/README contract tests cover critical defaults and exact descriptions at
`tests/readme.test.ts:5-306`.

## Design and Implementation Plan Status

The original audit found 238 checked task boxes and 19 unchecked boxes across
nine dated implementation plans. Every unchecked box belonged to the hover
actions plan, whose runtime behavior and tests were already complete. All other
plans recorded completed work.

Because implementation plans are execution artifacts rather than current
product documentation, they were removed after this audit. Git history retains
their task-by-task detail. The eight design records with durable architectural
value now live in `docs/design/`, with their implementation date and commit
listed in `docs/design/README.md`.

## TODO, FIXME, HACK, WIP, and Roadmap Audit

### Confirmed non-backlog markers

| Marker                                                                                                                      | Why it is not unfinished work                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playground/index.ts:148-150` (`TODO`, `TODO`, `FIXME`)                                                                     | The preceding heading says “Colors in comments (should be highlighted)” at lines 144-146. The three color matches are recorded in `tests/__snapshots__/playground/index.ts.snap`, and the fixture is enforced by `tests/playground-snapshot.test.ts:188-202`. |
| `playground/css.css:354-355` (two `TODO`s)                                                                                  | The preceding line says “Colors in comments should also be highlighted.” Both matches are recorded in `tests/__snapshots__/playground/css.css.snap`.                                                                                                          |
| `src/decorations/marker-types.ts:49` (`hack`)                                                                               | This is an explanatory comment for the implemented underline rendering workaround, not a missing task; the assignment follows immediately at line 50.                                                                                                         |
| “first roadmap phase” / “later optimization work” in `docs/design/2026-07-11-quality-hardening-design.md:11-14` and line 44 | The phase's concrete deliverables are implemented. No standalone roadmap or later-feature list exists.                                                                                                                                                        |
| “later navigation work” in `docs/design/2026-07-11-dtcg-yaml-design.md:76-80`                                               | Navigation was a later phase and is now implemented in `src/color-navigation/**`.                                                                                                                                                                             |

No actionable `TODO`, `FIXME`, `XXX`, `HACK`, `WIP`, “coming soon,” “not
implemented,” or equivalent marker was found in tracked runtime source.

### Explicit non-goals, not missing features

The following exclusions are intentional and should not be reported as planned
but unfinished functionality:

- Hover actions exclude a webview, arbitrary alpha input, extra HEX case
  buttons, and lossless preservation of every source syntax
  (`docs/design/2026-07-07-hover-color-actions-design.md:250-258`).
- Navigation excludes find-all-references, rename, completion, diagnostics, and
  a persistent workspace index
  (`docs/design/2026-07-11-contextual-color-navigation-design.md:26-28`).
- DTCG excludes `$extends`, remote/package references, untyped-object guessing,
  YAML-wide arbitrary strings, token rewriting, and YAML-anchor aliases
  (`docs/design/2026-07-11-dtcg-yaml-design.md:51-58`).
- The native provider excludes replacing built-in providers, default-on native
  picker behavior, and new syntaxes
  (`docs/design/2026-07-11-native-color-provider-design.md:31-37`).
- Quality hardening excludes browser pixel tests, optimization, CI performance
  budgets, and parser-result changes
  (`docs/design/2026-07-11-quality-hardening-design.md:31-36`).
- Workspace palette/contrast excludes a persistent Tree/Activity Bar view,
  continuous indexing, automatic diagnostic rewrites, runtime/cascade/image
  inference, APCA, and out-of-workspace scanning
  (`docs/design/2026-07-12-workspace-palette-contrast-design.md:328-336`).

Some exclusions in the oldest hover design, notably a color picker and palette
view (`docs/design/2026-07-07-hover-color-actions-design.md:255-256`),
were later delivered as separate opt-in/Quick Pick features. This reinforces
that the dated design files describe phase boundaries rather than a current
backlog.

## Remaining Gaps

### Confirmed feature gaps

None found.

### Verification limitation

1. **Fresh extension-host verification remains separate from this audit.** The
   Electron and Web smoke suites exist and cover activation, commands, actual
   highlighting, and a contrast diagnostic, but this audit freshly ran only the
   unit suite. This is a verification limitation, not evidence of a feature
   gap.

## Verdict

Yes: the functionality currently promised by README, extension metadata, and
the retained design records is present in the repository. There is no confirmed
TODO or planned-but-unimplemented feature. Completed execution plans have been
removed; the only unfinished-looking items are deliberate playground
TODO/FIXME fixtures and explicit non-goals.
