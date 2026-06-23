# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript VS Code extension built with `reactive-vscode` and bundled by
`tsdown`. Source files live in `src/`: extension lifecycle code is in
`src/index.ts`, commands in `src/commands/`, color parsing strategies in
`src/strategies/`, editor/decorator logic in `src/core/` and
`src/decorations/`, and shared color utilities in `src/color/`. Tests live in
`tests/` with fixtures and snapshots under `tests/fixtures/` and
`tests/__snapshots__/`. `playground/` contains sample files used for manual and
snapshot coverage.

## Build, Test, and Development Commands

Use `pnpm` for all package tasks.

- `pnpm dev`: run `tsdown` in watch mode for local extension development.
- `pnpm build`: bundle the extension into `dist/`.
- `pnpm typecheck`: run TypeScript checks with `tsgo --noEmit`.
- `pnpm lint`: run `oxlint`.
- `pnpm format` / `pnpm format:check`: format or verify formatting with
  `oxfmt`.
- `pnpm test` / `pnpm test:watch`: run Vitest once or in watch mode.
- `pnpm pack`: create a VS Code extension package with `vsce`.

## Coding Style & Naming Conventions

Follow `.editorconfig` and `.oxfmtrc.jsonc`: 2-space indentation, LF endings,
single quotes for TypeScript, no semicolons, trailing commas, and 80-column
formatting where practical. Keep modules ESM-only and prefer explicit, focused
exports. Name strategy files by the color syntax they detect, such as
`hex.ts`, `scss-vars.ts`, or `named-colors.ts`; test files should mirror the
feature name with `*.test.ts`.

## Testing Guidelines

Vitest is the test framework. Add focused unit tests for parser and utility
changes, and update playground snapshots when behavior intentionally changes.
Run `pnpm test` before submitting. For changes touching extension runtime,
configuration, or VS Code web support, also run `pnpm typecheck` and consider
manual checks against files in `playground/`.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits, for example `feat: support vscode web
runtime`, `fix: harden workspace path handling`, and `docs: credit original
color highlight extension`. Keep commit subjects imperative and scoped to one
change. Pull requests should describe the behavioral change, list tests run,
link related issues, and include screenshots or short recordings when decoration
rendering changes.

## Agent-Specific Instructions

When running shell commands as an agent in this repository, prefix commands with
`rtk` as requested by the local Codex instructions, for example
`rtk pnpm test`.
