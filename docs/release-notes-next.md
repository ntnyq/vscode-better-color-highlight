# Next release notes

Status: unreleased quality and delivery improvements after [v0.9.0](releases/v0.9.0.md).
The package and generated extension metadata remain at 0.9.0 until the next
version is chosen.

## Quality and delivery

- Add deterministic CSS decimal-grid and tie scans for all four rounding
  strategies, signed steps, numbers/percentages/angles, modulo/remainder signs,
  signed zero, extreme finite values, intermediate precision, and shared limits.
- Run desktop smoke tests on Ubuntu and Windows against VS Code 1.140.0 and
  stable; retain Ubuntu Web and installed-VSIX checks.
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

- Formatting, lint, types, 83 unit/snapshot files with 2,080 tests, stable
  Electron/Chromium Web hosts, and installed-VSIX activation checks passed.
- The shared desktop suite also passed locally with VS Code 1.140.0. Windows
  and Ubuntu matrix execution remains to be confirmed by CI.
- All 40 benchmark fixtures passed; measurements are recorded in the
  [quality follow-up baseline](performance-baseline.md#quality-follow-up-baseline-2026-10-25).
- The read-only verifier returned `verified` for the archived v0.9.0 commit and
  recorded VSIX hash against both public services.

Follow [the release workflow](releasing.md) to choose a version once, validate the
final archive, commit the release tree, and verify both publication destinations.

The v0.9.0 publication timestamps, checks, and matching Marketplace artifact
hash are archived in [its release record](releases/v0.9.0.md).
