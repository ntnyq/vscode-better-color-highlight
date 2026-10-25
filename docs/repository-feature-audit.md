# Repository Feature Audit

Date: 2026-10-25. Scope: the released v0.9.0 tree.

## Current contract

`package.json` declares 13 public commands and 30 public settings. Generated
`src/meta.ts`, the README configuration table, runtime registration, and tests
describe the same extension contract. This replaces the July audit's counts
and stale line references; Git history retains that historical audit.

The extension's documented features are implemented. Support is intentionally
static and bounded: unresolved runtime values, ambiguous scopes/cascades,
untrusted cross-file access, and expressions exceeding resource limits are
skipped. A design record's historical non-goals do not create backlog promises.

## Implementation and verification map

| Capability                                                                                                                   | Runtime owner                                                                                   | Verification                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| HEX, CSS named/function colors, missing components, wide gamut, interpolation, relative colors, alpha, and typed static math | `src/engine/strategies/css-color/`, `color-functions.ts`, `hex.ts`, `named-colors.ts`, `hwb.ts` | `tests/engine/strategies/css-color/`, playground snapshots                                |
| `calc`, comparison and stepped math in channels/alpha and calculated mix percentages                                         | `src/engine/strategies/css-color/calc.ts`, `parser.ts`, `relative.ts`                           | evaluator/parser tests, CSS-variable/provider tests, shared desktop/Web/VSIX smoke checks |
| CSS/SCSS/Less/Stylus variables with conservative scope and cross-file resolution                                             | `src/engine/strategies/css-vars/`, `scss-vars/`, `less-vars.ts`, `stylus-vars.ts`               | corresponding strategy/resolver/cache/definition suites                                   |
| Tailwind v3/v4 palettes, CSS-first themes, utilities, opacity and contextual navigation                                      | `src/engine/strategies/tailwind-theme/`                                                         | Tailwind strategy suites and playground snapshots                                         |
| JSON/JSONC/JSON-formatted `.tokens` and YAML design-token colors and aliases                                                 | `src/engine/strategies/design-tokens/`                                                          | design-token parser/resolver/navigation suites                                            |
| ANSI SGR colors and configurable base palette                                                                                | `src/engine/strategies/ansi-sgr/`                                                               | ANSI parser/palette tests and desktop/Web smoke checks                                    |
| Dart/Flutter, Compose, Android, SwiftUI/UIKit and qualified Unity constructors                                               | native strategies under `src/engine/strategies/`                                                | native parser/presentation tests, desktop/Web picker and hover-alpha editing fixtures     |
| Android XML resource-reference definition navigation                                                                         | `src/engine/strategies/android-resources/`                                                      | parser/resolver tests and desktop/Web local/virtual-filesystem navigation scenarios       |
| Decorations, ruler markers, hover, copying, conversion, alpha editing and native picker                                      | `src/features/highlight/`, `hover/`, `color-provider/`, `src/extension/commands/`               | focused lifecycle/provider/command tests, real-host editing and installed VSIX            |
| CSS/SCSS/Less/Stylus/token/Tailwind/Android definition navigation                                                            | `src/features/color-navigation/`                                                                | definition suites, stale-result/target checks, real-host Android scenarios                |
| Explicit cancellable workspace palette and contrast comparison                                                               | `src/features/workspace-palette/`, `contrast/`                                                  | scanner/model/Quick Pick/contrast tests                                                   |
| Opt-in deterministic contrast diagnostics and quick fixes                                                                    | `src/features/contrast/`                                                                        | pair/diagnostic/code-action/lifecycle suites and real-host checks                         |
| Desktop/Web, virtual and untrusted workspaces                                                                                | runtime bundle entries and `src/shared/workspace/`                                              | shared desktop/Web tests, Workspace FS tests, package manifest/runtime-entry checks       |

The navigation dispatcher and provider preserve source freshness and trust
gates. Android navigation stays within one `res` root and declines duplicate,
qualified, cyclic, missing, or state-list definitions. Unity remains limited
to qualified literal constructors. These boundaries are documented behavior.

## Commands and settings

`src/extension/commands/index.ts` registers enable/disable; four copy commands;
four replace commands; alpha adjustment; workspace palette; and contrast
comparison. Command tests and extension-host checks cover registration and
actions, including stale-edit rejection.

The 30 settings cover feature switches, language/matching policies, Tailwind
sources, variable/token resolution, workspace scan filters, size limits,
ARGB/ANSI interpretation, marker styles, and debug logging. Compared with the
July audit, ANSI matching and palette overrides account for the two additional
settings. `tests/tooling/readme.test.ts` checks documentation/metadata contracts.

## Delivery checks

`pnpm release:check` now runs formatting, lint, types, the full `pnpm test`
(unit/snapshot plus Electron/Chromium Web), and `pnpm test:package`. The release
upload entry runs these checks against the current version before publishing.
It requires a committed tree (including untracked files), checks generated
metadata versions, and uploads the exact retained, installation-tested VSIX.
The combined release command stops after preparation for review and commit.
Version preparation regenerates metadata without creating commits, tags, or
pushes. See [the release workflow](releasing.md).

The current validation totals and environment are recorded in
[the v0.9.0 release record](releases/v0.9.0.md). Performance measurements
are informational and live in [the baseline](performance-baseline.md).

## Remaining scope

No documented feature was found to exist only in prose. Playground TODO/FIXME
color examples remain intentional fixtures, not engineering tasks. Design
records are indexed in [the design directory](design/README.md), including the
October Android, Unity, absolute/comparison math, and stepped-math work.

Potential future work requires separate product decisions: additional CSS math
functions/constants and dimensional algebra; dynamic native expressions;
broader Compose color spaces; resource qualifier inference; persistent workspace
indexing; and runtime/cascade-dependent color interpretation. These are
candidates or deliberate exclusions, not unfinished v0.9.0 requirements.

This audit verifies the repository contract. Marketplace publication, the
GitHub Release, and the matching public VSIX download are independently
documented in [the v0.9.0 release record](releases/v0.9.0.md).
