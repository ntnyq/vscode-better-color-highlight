# v0.8.0 release notes

Status: prepared for manual release, not published. The package and generated
extension metadata are versioned as 0.8.0. See [manual release steps](#manual-release).

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

## Review fixes included

- Bound CSS custom-property shorthand candidates to prevent excessive regular
  expression backtracking on malformed input.
- Preserve numeric `0x` / `0X` prefixes and letter case in picker, replacement,
  and alpha edits.
- Honor Tailwind important utilities and skip equal-priority conflicts instead
  of inferring CSS precedence from class order.
- Interpret numeric Tailwind slash opacity as a percentage: `/0.5` is 0.5%,
  while `/[0.5]` is 50%.
- Resolve SCSS variables by lexical scope and declaration order, retaining alias
  values at assignment and sharing bindings between highlighting and navigation.
- Honor SCSS `!default` and `!global` assignment flags; skip bindings affected
  by uncertain control flow.
- Skip Tailwind contrast diagnostics for unsupported opacity, filters, blending,
  and other rendering effects, including variant utilities.

## Release preparation

- `pnpm generate:meta` formats the generated README configuration section so
  `pnpm release:build` leaves formatting checks passing.
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

Revalidated version 0.8.0 with both implementation commits (`49c665e` and
`05249bb`) included, using Node 24.21.0 and pnpm 12.8.1 on macOS arm64.

- `pnpm install --frozen-lockfile`: passed without lockfile changes.
- `pnpm release:build`, `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`:
  passed; package and generated metadata versions both equal 0.8.0.
- `pnpm test`: all 73 files and 1,317 unit/snapshot tests passed, together with
  desktop and Chromium Web extension-host smoke checks on VS Code 1.140.0.
- `pnpm test:package`: the 0.8.0 VSIX passed isolated installation, runtime-entry
  checks, activation, commands, and literal/relative color highlighting.
- `pnpm run pack --out vscode-better-color-highlight-0.8.0.vsix`: produced the
  manual-release artifact. Archive inspection confirmed the 0.8.0 manifests,
  both production runtime entries, and the expected eight files. Test bundles,
  source files, and development dependencies are excluded. Package inputs and
  runtime hashes match the successful installation-test build.

The earlier eight-fixture benchmark run is recorded in
[the performance baseline](performance-baseline.md); it was not rerun during
this release preparation.

Prepared artifact: `vscode-better-color-highlight-0.8.0.vsix` (228,163 bytes).

SHA-256:

```text
d2632de86e5b1bd51e3da4c2c628d616220cadf5f56087431f387f8342446606
```

See the README for static subsets and explicit exclusions. Unity and Android
resource-reference navigation are deferred. No release has been published by
this implementation task.

## Manual release

The version bump is already applied. Use the prepared VSIX for this release;
`pnpm release` and `pnpm release:version` would invoke another version bump.
Publishing requires Marketplace credentials for the `ntnyq` publisher (the
existing `vsce` login or `VSCE_PAT`).

1. Review and commit `package.json`, `src/meta.ts`, and this document:

   ```sh
   git add package.json src/meta.ts docs/release-notes-next.md
   git commit -m "chore: prepare v0.8.0 release"
   ```

2. Publish the prepared package from the repository root:

   ```sh
   pnpm exec vsce publish --packagePath vscode-better-color-highlight-0.8.0.vsix
   ```

   The same VSIX can be uploaded manually through the Marketplace publisher
   management page. If release inputs change, rerun the checks below and rebuild
   the VSIX before publishing.

3. After Marketplace publication succeeds, tag the release commit and push the
   branch and tag:

   ```sh
   git tag v0.8.0
   git push origin main
   git push origin v0.8.0
   ```

   The tag triggers `.github/workflows/release.yml`, which creates GitHub release
   notes with `changelogithub`. That workflow does not publish to Marketplace.

To repeat the local release checks and rebuild the package:

```sh
pnpm install --frozen-lockfile
pnpm release:build
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:package
pnpm run pack --out vscode-better-color-highlight-0.8.0.vsix
```

`pnpm release:check` currently covers formatting, lint, types, and unit tests;
the full `pnpm test` and `pnpm test:package` checks above are also required.
