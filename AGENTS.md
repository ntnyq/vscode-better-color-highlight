# Agent Guide for vscode-better-color-highlight

This file helps AI coding agents become productive quickly in this repository.

## Scope and Priority

- Follow this file first for repo-specific guidance.
- For user-facing behavior, commands, and extension settings, link to and reuse [README.md](README.md) instead of duplicating content.

## Setup and Commands

- Package manager: `pnpm`.
- Install deps: `pnpm install`.
- Dev build (watch): `pnpm dev`.
- Production build: `pnpm build`.
- Test: `pnpm test`.
- Typecheck: `pnpm typecheck`.
- Lint: `pnpm lint`.
- Format: `pnpm format`.

Before finishing code changes, run at least:

1. `pnpm test`
2. `pnpm typecheck`

When touching style-sensitive code, also run:

1. `pnpm lint`
2. `pnpm format:check`

## Project Structure

- `src/index.ts`: extension activation entry.
- `src/composables/use-color-highlight.ts`: reactive lifecycle for listening, matching, and decorating.
- `src/core/strategy-registry.ts`: selects strategies by language/config.
- `src/strategies/`: pure color-detection strategies (`find*` style functions).
- `src/core/color-match.ts`: merge/group of matched color ranges.
- `src/decorations/`: VS Code decoration type creation and caching.
- `src/color/`: pure color conversion and contrast helpers.
- `src/config.ts`: reactive settings access.
- `tests/`: Vitest unit tests and playground snapshot tests.

## Conventions for Changes

- Keep color parsing and matching logic pure in `src/strategies/` and `src/color/`.
- Avoid importing `vscode` in strategy and color utility files.
- Keep VS Code API usage in activation/composable/decoration layers.
- Prefer extending existing strategy modules before introducing new architecture.
- Keep naming consistent:
  - strategies: `find*`
  - composables: `use*`
- Preserve ESM TypeScript style used across the repo.

## Testing Expectations

- Add or update Vitest coverage in `tests/` for every behavior change.
- For parser/regex updates, include both positive and negative cases.
- If a change impacts multiple syntaxes (hex/rgb/hsl/vars), add cross-format regression tests.
- For output/stability changes that affect rendered examples, update snapshot tests as needed.

## Pitfalls and Safety Checks

- Strategy performance matters: avoid expensive regex/backtracking for large files.
- Keep editor filtering behavior intact (`src/core/editor-filter.ts`) so non-code panels are not processed.
- Decoration resources must be disposed correctly; avoid leaks in cache/lifecycle code.
- `src/meta.ts` is generated from extension metadata. Regenerate using:
  - `pnpm generate:meta`
  - Do not hand-edit generated sections unless necessary.

## Useful References

- User docs and settings: [README.md](README.md)
- Build config: [tsdown.config.ts](tsdown.config.ts)
- TypeScript config: [tsconfig.json](tsconfig.json)
- Representative strategy: [src/strategies/hex.ts](src/strategies/hex.ts)
- Complex strategy: [src/strategies/color-functions.ts](src/strategies/color-functions.ts)
- Lifecycle/decorations integration: [src/composables/use-color-highlight.ts](src/composables/use-color-highlight.ts)
