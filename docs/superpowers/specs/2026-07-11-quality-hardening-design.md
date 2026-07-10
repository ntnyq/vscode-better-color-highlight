# Quality Hardening Design

## Summary

The first roadmap phase hardens the repository before new product features are
added. It prevents linked worktrees from being discovered as duplicate Vitest
projects, makes the VS Code Web smoke test exercise real color highlighting,
and adds repeatable parser performance benchmarks.

This phase changes test infrastructure only. Extension runtime behavior and
user-facing configuration remain unchanged.

## Goals

- A test run from the main checkout discovers each test file exactly once,
  even when linked worktrees live under `.worktrees/`.
- Desktop and Web extension-host tests both prove that the extension activates,
  registers commands, opens a CSS document, and publishes the expected color
  highlight state.
- Maintainers can measure representative literal, Tailwind, and CSS custom
  property parsing workloads with one pnpm command.
- The normal unit suite remains deterministic and does not enforce timing
  thresholds that vary between machines.

## Non-Goals

- Browser pixel comparison or clicking VS Code UI controls.
- Performance optimization in this phase.
- CI performance budgets.
- New color syntaxes or changes to detector results.

## Approaches Considered

### 1. Minimal configuration-only patch

Add `.worktrees` to Vitest exclusions and leave the current smoke tests and
performance coverage unchanged. This is low risk but does not establish Web
runtime behavior or a baseline for later optimization work.

### 2. Shared extension-host scenario and explicit benchmarks

Add the exclusion, extract a platform-neutral extension-host scenario used by
desktop and Web tests, and add opt-in Vitest benchmarks. This is the recommended
approach because it covers the important runtime boundary without depending on
the rendered workbench UI.

### 3. Full browser UI automation

Drive VS Code Web with browser locators, inspect decorations visually, and add
performance thresholds in CI. This provides broader end-to-end coverage but is
too brittle and expensive for the first hardening phase.

## Architecture

### Vitest isolation

`vitest.config.ts` will extend Vitest's default exclusions with
`**/.worktrees/**`. A focused configuration test will import the config and
assert that the repository-local worktree directory stays excluded.

The default exclusion list must be preserved instead of replaced, so standard
directories such as `node_modules` continue to be ignored.

### Shared extension-host scenario

`tests/e2e/shared.ts` will contain platform-neutral helpers for:

- locating and activating the extension;
- checking required command registration;
- opening an in-memory CSS document;
- waiting for `color-highlight.internal.getHighlightState`;
- asserting the language, match count, and resolved color set.

The shared module uses local assertion helpers and the standard timer API. It
must not import Node built-in modules because the same bundle runs in a browser
extension host.

Desktop tests execute TypeScript modules directly through Node ESM, while Web
tests bundle the same modules. Shared imports therefore use explicit `.ts`
extensions, enabled by TypeScript's `allowImportingTsExtensions` option in this
no-emit, bundler-resolved project.

An in-memory document avoids desktop file paths and works in virtual and Web
workspaces. Desktop tests retain their existing configuration mutation check,
while Web tests call the shared highlight scenario instead of checking only
activation.

Polling remains bounded. Timeout failures include the last observed highlight
state so extension-host failures are diagnosable.

### Performance benchmarks

`benchmarks/color-detection.bench.ts` will use Vitest's benchmark API and fixed
synthetic inputs. It will cover:

- direct CSS color literals and functions;
- Tailwind color utility scanning;
- CSS custom property declaration collection and usage resolution.

`pnpm bench` will run the benchmark suite explicitly. Benchmarks will not run as
part of `pnpm test`, and this phase will not assert wall-clock thresholds.

## Data Flow

The extension-host scenario creates document text, shows the document, then
queries the existing internal highlight-state command until the asynchronous
decoration pipeline has completed. It validates public runtime effects without
reaching into composable internals.

Benchmarks call production detector functions directly with immutable generated
inputs. They consume detector results only to keep the work observable; they do
not write snapshots or modify the workspace.

## Error Handling

- Extension activation failure throws with the extension identifier.
- Missing commands report the exact command identifier.
- Highlight polling has a fixed attempt count and reports the last state on
  timeout.
- Benchmark setup is synchronous and deterministic; parser failures fail the
  benchmark command normally.

## Testing and Verification

- Red-green test for the Vitest worktree exclusion.
- Desktop extension-host smoke test using the shared scenario.
- Web extension-host smoke test using the same highlight assertions.
- `pnpm bench --run` completes all benchmark cases.
- Full format, lint, typecheck, unit, build, desktop E2E, and Web E2E gates pass.

## Commit Boundary

The implementation is one independently reviewable quality-infrastructure
commit with the Conventional Commit message:

`test: harden repository quality gates`
