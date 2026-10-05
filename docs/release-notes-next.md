# Next release notes

Status: unreleased changes after [v0.8.0](releases/v0.8.0.md). The package and
generated extension metadata remain at 0.8.0 until the next version is chosen.

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

## New features

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

## Validation on 2026-10-05

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

Run `pnpm release:check`, the full `pnpm test`, and `pnpm test:package` before
publication. `pnpm release:check` alone covers formatting, lint, types, and
unit tests; it does not run the desktop/Web or installed-package checks.

Choose the next version once, regenerate metadata with `pnpm release:build`,
and repeat the full checks against the final versioned package. `pnpm release`
and `pnpm release:version` both invoke a version bump, so do not use them to
publish an already-versioned VSIX. Confirm the Marketplace version and the
separate GitHub tag/release after publication, then archive these notes.

Android resource-reference navigation (P2), static Unity colors (P3), relative
CSS comparison math (P4), and absolute CSS math (P5) are implemented. Additional
functions such as `round()`, `mod()`, and `rem()`, plus math in `color-mix()`
weights, remain future candidates.
