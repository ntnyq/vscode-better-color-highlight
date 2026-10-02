# Next release notes

Status: unreleased. The package version remains 0.7.0; versioning, tagging, and
publication are left to the maintainer after reviewing this delivery.

## User-facing changes since 0.7.0

- Complete CSS Color 4 missing-component and linear Display P3 handling, with
  high-precision static `color-mix()` interpolation and complete-range matching.
- Add relative CSS color functions, bounded `calc()` arithmetic, deterministic
  custom-property substitution, and draft `alpha()` support.
- Recognize Android XML and Compose packed alpha-first colors; preserve source
  syntax through picker and alpha edits.
- Add Kotlin Compose numeric RGB(A), HSL, and HSV colors plus Kotlin/Java
  Android RGB, ARGB, and HEX string factories.
- Add SwiftUI/UIKit static RGB, grayscale, HSB, and explicit RGB color spaces.
- Improve edit-range validation, alpha precision, and dependency tracking so
  stale commands and asynchronous results cannot rewrite newer source text.

## Release preparation

- `pnpm test` includes unit/snapshot tests and desktop/Web smoke tests.
- `pnpm test:package` builds a VSIX, installs it in a temporary VS Code profile,
  checks both runtime entries, and exercises the installed distribution.
- The VSIX includes only production `dist/index.js` and `dist/index.cjs`
  bundles; test bundles are excluded.
- `pnpm bench` covers literals, Tailwind, nested expressions, malformed input,
  variable resolution, long variable chains, and native constructors. Timings
  are informational; no machine-dependent CI threshold is imposed.
  Recorded fixture measurements are in [the performance baseline](performance-baseline.md).

## Validation on 2026-10-02

- `pnpm test`: 73 test files and 1,252 unit/snapshot tests passed, followed by
  desktop and Chromium Web extension-host smoke checks on VS Code 1.140.0.
- `pnpm test:package`: VSIX content checks, isolated installation, activation,
  commands, and literal/relative color highlighting passed.
- `pnpm bench`: all eight fixtures completed; measurements are recorded in
  the performance baseline.
- Build, lint, TypeScript checks, and formatting checks passed.

See the README for static subsets and explicit exclusions. Unity and Android
resource-reference navigation are deferred. No release has been published by
this implementation task.
