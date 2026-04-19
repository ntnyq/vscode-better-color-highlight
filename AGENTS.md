# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project at a glance

This project is a VS Code extension that highlights colors across many formats, including hex, CSS color functions, named colors, and stylesheet variables.

- Main product overview: see README.md
- Deeper repo notes: see CODEBUDDY.md

## First things to know

- Use `pnpm` for all package management and scripts.
- Prefer the existing VS Code task or `pnpm dev` for watch-mode builds.
- Run the smallest relevant verification after changes:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm release:check` for full validation

## Architecture

Follow the existing pure-core / reactive-shell split:

- `src/color/`, `src/core/`, `src/strategies/`: pure logic, no VS Code API usage
- `src/composables/`, `src/decorations/`, `src/commands/`: editor integration and reactive-vscode wiring

When fixing parsing or matching bugs, keep the root-cause change inside the pure layer whenever possible.

## Repository-specific rules

- Do not manually edit `src/meta.ts`; regenerate it with `pnpm generate:meta` after changing commands or configuration in `package.json`.
- Keep `ColorMatch` output normalized as `{ start, end, color }`, with colors normalized to `rgb()` or `rgba()` strings.
- Variable strategies must highlight usages, not definitions, and should preserve nested resolution behavior.
- Keep editor filtering intact so output/debug/terminal documents are not tracked.
- Prefer small targeted fixes over broad rewrites.

## Testing expectations

- Add or update Vitest coverage when changing:
  - color conversion logic
  - matching strategies
  - strategy selection or grouping behavior
  - variable resolution rules
- Mirror the existing one-file-per-feature test style under `tests/`.

## High-value files

- `src/composables/use-color-highlight.ts`: reactive pipeline from document text to decorations
- `src/core/strategy-registry.ts`: language-aware strategy selection
- `src/core/color-match.ts`: grouping and deduplication
- `src/strategies/*.ts`: individual detectors
- `tests/*.test.ts`: expected behavior and edge cases

## Working style

- Preserve the current formatting style: 2-space indentation, single quotes, no semicolons.
- Avoid introducing new dependencies unless necessary.
- If a change touches extension settings or commands, update generated metadata and verify related tests.
