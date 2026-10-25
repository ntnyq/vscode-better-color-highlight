# v0.9.0 release preparation

Status: prepared locally, not published. The package and generated extension
metadata declare **0.9.0**. Changes are relative to
[v0.8.0](releases/v0.8.0.md). Marketplace publication and Git tag/release
creation are explicitly outside this preparation run.

## User-facing fixes

- Discard hover matches when a document closes, including results that finish
  later, so reopening an untitled document with a reused URI/version cannot
  expose an earlier document's color range or edit commands.
- Preserve comments, whitespace, and numeric suffix case when native Android
  `Color.rgb()` gains an alpha channel and becomes `Color.argb()`.
- Fix lazy workspace API loading in the Web bundle by compiling external
  dynamic imports to the extension host's CommonJS loader.
- Apply absolute RGB and Lab-family channel bounds before mixing or deriving
  relative colors, normalize absolute hues, and clamp negative HSL saturation.
  Reject non-finite alpha values, empty legacy alpha arguments, and colors
  whose conversion to the preview space overflows.
- Normalize excessive HWB white/black values by their ratio, including
  computed values above 100%, so `hwb(0 200% 100%)` previews as two-thirds gray.
- Preserve extended HSL saturation and lightness during conversion, so
  calculated channels are not prematurely clipped before interpolation.
- Preserve decimal `round()` grid points and ties, plus rounding direction when
  a quotient underflows. Reject `mod()` results absorbed into the excluded
  divisor boundary instead of producing an incorrect preview.

## New features

- Add bounded `round()`, `mod()`, and `rem()` in absolute/relative CSS channels
  and alpha, plus static math in `color-mix()` weights. Preserve typed units,
  rounding strategies, signed zero, variable substitution, and complete
  expression edits. Clamp finite computed weights only after evaluating the
  entire calculation; reject out-of-range literal weights, invalid units,
  zero steps, and non-finite calculations. See
  [the stepped math design](design/2026-10-25-css-stepped-math.md).
- Add static `calc()`, `min()`, `max()`, and `clamp()` in absolute CSS color
  channels and alpha, including legal legacy RGB/HSL math arguments. Preserve
  nested separators, channel types, percentage scales, missing components,
  variable references, and complete-expression picker/alpha replacements.
  Absolute math colors also work as mix operands and relative-color origins.
  See [the absolute CSS math design](design/2026-10-05-css-absolute-math.md).
- Add static `min()`, `max()`, and `clamp()` calculations in relative CSS
  colors and `alpha()`, including nested `calc()`, compatible angle units,
  and `none` clamp bounds. Keep complete expression ranges through
  custom-property resolution and editor replacements. Reject invalid,
  mixed-unit, non-finite, and over-limit calculations. See
  [the CSS math design](design/2026-10-05-css-comparison-math.md).
- Add static C# `new UnityEngine.Color(...)` and `Color32(...)` highlighting,
  hover actions, native picker presentations, and alpha adjustment. Preserve
  constructor syntax, argument names, comments, whitespace, and float suffix
  case; add valid C# float suffixes when integer components become fractional.
  Skip unqualified names, dynamic expressions, and out-of-range values. See
  [the Unity design](design/2026-10-05-unity-colors.md).
- Add Go to Definition and Peek Definition for static Android XML
  `@color/name` references and aliases in the same `res` directory. Skip
  duplicate, qualified, cyclic, missing, and state-list resources. Use bounded
  filesystem reads in trusted workspaces and reflect unsaved resource edits
  on the next request. See [the design](design/2026-10-05-android-resource-navigation.md).
- Discard asynchronous definition results when the source changes or closes,
  and validate the Android target snapshot before returning its ranges.

## Development and validation

- Upgrade development dependencies and refresh the lockfile; pin pnpm 12.15.0.
- Make `pnpm release:check` cover unit/snapshot, desktop/Web, and installed-VSIX
  checks in addition to formatting, lint, and types. `pnpm release:publish`
  validates the current version before uploading without bumping it again.
  Version preparation no longer commits, tags, or pushes. See
  [the release workflow](releasing.md).
- Stop `pnpm release` after preparation so version changes can be committed.
  Publication requires a clean committed tree and uploads the exact VSIX
  retained after installation tests, without another build or package step.
  Check generated metadata and package version consistency before publication.
- Run unit tests before launching the desktop/Web hosts to avoid CPU contention
  with existing parser performance-regression assertions.
- Refresh the feature audit and design index, and add stepped-math, computed
  weight, malformed-input, and external CSS-variable benchmark fixtures.
- Archive the published v0.8.0 release record and verify the Marketplace and
  GitHub publication states independently.
- Add desktop and Chromium Web extension-host coverage for Compose, Android
  XML/Java/Kotlin, SwiftUI, UIKit, and Unity C# color editing. Exercise native
  picker presentations, alpha actions from real hover links, complete expression
  ranges, preservation of labels/suffixes/comments, and rejection of stale
  commands after source edits.
- Register Kotlin through a test-only language extension that is excluded from
  the production VSIX.
- Add Android resource parser/resolver regressions and desktop/Web definition
  provider coverage, including cross-file aliases, exact UTF-16 ranges,
  unsaved edits, qualifier changes, cycles, and navigation configuration.
- Add resource XML and malformed-tag parsing benchmarks; measurements are
  recorded in [the performance baseline](performance-baseline.md).
- Add 87 Unity parser/editing cases, source-presentation and provider/command
  integration regressions, a C# playground snapshot, and realistic/malformed
  constructor benchmarks.
- Stop invalid nested Unity calls early, with shared-scanner compatibility
  regressions. The 10,000-unclosed-constructor benchmark now takes about
  2 ms median on the recorded machine.
- Add CSS comparison evaluator and relative-color regressions, variable
  substitution and editor-editing coverage, desktop/Web smoke cases, and
  playground examples. Add normal, over-limit, and unclosed math benchmarks.
- Add absolute CSS math parsing, composition, variable-resolution, and editing
  regressions, an absolute-math playground snapshot, and desktop/Web smoke
  cases. Benchmark normal expressions, bounded rejection, unclosed starts,
  and excessive top-level arguments.

## Validation on 2026-10-25

Validated the 0.9.0 package on macOS arm64 (Apple M1 Pro), Node 24.22.1,
pnpm 12.15.0, Vitest 5.0.5, and VS Code 1.143.1:

- `pnpm release:check` passed formatting, lint, types, 81 unit/snapshot files
  with 2,025 tests, Electron and Chromium Web hosts, and isolated VSIX
  installation/activation checks.
- Review regressions cover decimal rounding grids/ties, quotient underflow,
  unrepresentable modulo endpoints, committed/staged/untracked release sources,
  Git's hidden-untracked configuration, the CLI boundary, and metadata versions.
- Desktop/Web editing includes 16 native fixtures and ten CSS math fixtures,
  with picker presentations and real hover alpha actions. Shared host and
  installed-package checks cover stepped math, computed variable weights,
  rejection of invalid math, and recovery of independently detectable colors.
- `pnpm bench` passed all 23 fixtures in one run after the build/host checks.
  The refreshed [baseline](performance-baseline.md#complete-baseline-2026-10-25)
  records median/p99 timings for normal and malformed expressions, native
  colors, Tailwind, and local/external variable resolution.
- The installed/tested `dist/release.vsix` was copied unchanged to the
  versioned artifact below. Archive inspection confirmed the version, both
  production runtime entries, and exactly eight files. Runtime bundle bytes
  match the validated build; test bundles and development dependencies are
  excluded.

Prepared artifact: `vscode-better-color-highlight-0.9.0.vsix`, 237,841 bytes.

SHA-256:

```text
b9b74ffb6f8a8e1f036d9ec3c4662db2b8b4f95a5c26b9d7d2282d816a7a9b03
```

This hash identifies the local prepared artifact. No Marketplace upload,
Git tag, push, or GitHub release was performed for 0.9.0.

## Historical validation on 2026-10-05

Validated on macOS arm64 with Node 24.21.0, user-managed pnpm 12.9.1, and
VS Code 1.140.0:

- Formatting, lint, and TypeScript checks passed.
- `pnpm test` passed: 79 files and 1,892 unit/snapshot tests, plus desktop and
  Chromium Web extension-host checks. Each host covers 16 native editing
  fixtures, eight CSS math editing fixtures, absolute/relative math with
  variable substitution, conversion-overflow rejection, and Android
  resource-navigation scenarios on local and virtual filesystems.
- `pnpm test:package` passed isolated VSIX installation, runtime-entry checks,
  activation, commands, and color highlighting. The VSIX contains eight files;
  test bundles and the Kotlin language fixture are excluded.

## Next release checks

The version has already been chosen. Use `pnpm release:check` to repeat the
complete validation and retain `dist/release.vsix` as the verified artifact. When
publication is separately authorized, `pnpm release:publish` checks and uploads
the current 0.9.0 version; do not invoke another version bump. Verify Marketplace
and GitHub independently before archiving these notes. Follow
[the release workflow](releasing.md) for commit and tag ordering.

Android resource-reference navigation, static Unity colors, comparison,
absolute and stepped CSS math, and computed mix weights are implemented.
Additional math functions/constants, general unit algebra, and broader native
color-space support remain candidates requiring separate scope decisions.
