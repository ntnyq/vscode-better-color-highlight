# Next release notes

Status: unreleased features, quality, and delivery improvements after [v0.9.0](releases/v0.9.0.md).
The package and generated extension metadata remain at 0.9.0 until the next
version is chosen.

## New features

- Support bounded CSS `abs()` and `sign()` in absolute/relative channels,
  alpha, and calculated mix weights. Preserve `abs()` result units and
  `sign()` signed zero; `sign()` always returns a number. Reject non-finite
  operands/intermediates, invalid arity, incompatible units, and resource-limit
  violations. Variable substitution and picker/alpha edits retain the complete
  expression. See [the design](design/2026-10-25-css-sign-math.md).
- Cover sign-related math with evaluator/parser regressions, variable/provider
  integration, playground snapshots, and LF/CRLF desktop/Web editing fixtures.
  The installed-VSIX smoke test includes sign math and overflow rejection.

## Quality and delivery

- Add deterministic CSS decimal-grid and tie scans for all four rounding
  strategies, signed steps, numbers/percentages/angles, modulo/remainder signs,
  signed zero, extreme finite values, intermediate precision, and shared limits.
- Run desktop smoke tests on Ubuntu and Windows against VS Code 1.140.0 and
  stable; retain Ubuntu Web and installed-VSIX checks.
- Run every native/CSS math picker and hover-alpha editing fixture with both
  LF and CRLF. Normalize fixture text, expected edits, and UTF-16 offsets to
  the selected document line ending rather than assuming LF on Windows.
- Add read-only public release verification for GitHub release/tag/manifest,
  Marketplace validation, and the exact downloaded VSIX SHA-256. Missing public
  data remains pending; a manual workflow retains machine-readable evidence.
- Move Tailwind markup-decoy timing into benchmarks; keep deterministic
  rejection and valid-theme recovery assertions in unit tests.
- Move the remaining shorthand, Tailwind-utility, and contrast-markup timing
  thresholds into benchmarks, including paired input sizes for scaling trends.
  Preserve malformed-input and exact-range correctness regressions.
- Refresh the research delivery status and separate GitHub version and
  Marketplace installation badges.

## Validation

- Formatting, lint, types, 84 unit/snapshot files with 2,205 tests, stable
  Electron/Chromium Web hosts, and installed-VSIX activation checks passed.
- The shared desktop suite also passed locally with VS Code 1.140.0. CI tracks
  both versions on Windows and Ubuntu.
- All 43 benchmark fixtures passed; focused sign-math measurements are recorded
  in the [sign-related baseline](performance-baseline.md#sign-related-css-math-2026-10-25).
- The read-only verifier returned `verified` for the archived v0.9.0 commit and
  recorded VSIX hash against both public services.

Follow [the release workflow](releasing.md) to choose a version once, validate the
final archive, commit the release tree, and verify both publication destinations.

The v0.9.0 publication timestamps, checks, and matching Marketplace artifact
hash are archived in [its release record](releases/v0.9.0.md).
