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

## New features

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
  XML/Java/Kotlin, SwiftUI, and UIKit color editing. Exercise native picker
  presentations, alpha actions from real hover links, complete expression
  ranges, preservation of labels/suffixes/comments, and rejection of stale
  commands after source edits.
- Register Kotlin through a test-only language extension that is excluded from
  the production VSIX.
- Add Android resource parser/resolver regressions and desktop/Web definition
  provider coverage, including cross-file aliases, exact UTF-16 ranges,
  unsaved edits, qualifier changes, cycles, and navigation configuration.
- Add resource XML and malformed-tag parsing benchmarks; measurements are
  recorded in [the performance baseline](performance-baseline.md).

## Validation on 2026-10-05

Validated on macOS arm64 with Node 24.21.0, user-managed pnpm 12.9.1, and
VS Code 1.140.0:

- Formatting, lint, and TypeScript checks passed.
- `pnpm test` passed all 75 files and 1,386 unit/snapshot tests, plus desktop
  and Chromium Web extension-host checks with 11 native editing fixtures each
  and Android resource-navigation scenarios on local and virtual filesystems.
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

Android resource-reference navigation (P2) is implemented. Unity colors and
additional static CSS math functions remain candidates for a future phase.
