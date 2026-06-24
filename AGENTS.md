# Repository Guidelines

## Project Structure & Module Organization

This repository is a TypeScript VS Code extension built with
`reactive-vscode` and bundled by `tsdown`. Source code lives in `src/`.
Extension activation is in `src/index.ts`, commands in `src/commands.ts`,
highlight orchestration in `src/composables/`, strategy registration in
`src/core/`, decoration rendering in `src/decorations/`, color parsers in
`src/strategies/`, and shared utilities in `src/utils/`. Tests live in
`tests/`; playground fixtures live in `playground/`; static assets live in
`res/`; generated extension metadata is in `src/meta.ts`.

## Build, Test, and Development Commands

Use `pnpm` for all package tasks.

- `pnpm dev`: run `tsdown` in watch mode for local extension development.
- `pnpm build`: bundle the extension into `dist/`.
- `pnpm test`: run the Vitest unit and snapshot suite.
- `pnpm test:e2e`: build, then run the VS Code extension-host smoke test.
- `pnpm lint`: run `oxlint`.
- `pnpm format` / `pnpm format:check`: write or verify formatting with
  `oxfmt`.
- `pnpm typecheck`: run TypeScript checks with `tsgo --noEmit`.
- `pnpm pack`: create a `.vsix` package with `vsce`.

## Coding Style & Naming Conventions

Follow `.editorconfig` and `.oxfmtrc.jsonc`: 2-space indentation, LF line
endings, single quotes, no semicolons, trailing commas, and 80-column wrapping
where practical. Keep modules ESM-only and prefer focused exports. Name parser
strategy files by syntax, for example `hex.ts`, `scss-vars.ts`, or
`named-colors.ts`. Keep test files close to the behavior name, such as
`hex.test.ts` or `css-vars-cache.test.ts`.

## Testing Guidelines

Vitest covers parser, utility, cache, and snapshot behavior. Add focused unit
tests for new parsing rules or regression fixes, and update playground
snapshots only when behavior intentionally changes. Use `tests/e2e/` for
extension-host smoke coverage that needs real VS Code APIs. Run `pnpm test`
before submitting; also run `pnpm test:e2e` for runtime, configuration, or
activation changes.

## Commit & Pull Request Guidelines

History uses Conventional Commits, such as `feat: support vscode web runtime`
and `fix: avoid highlighting css named-color identifiers`. Keep commits scoped
and imperative. Pull requests should describe the behavior change, list tests
run, link related issues, and include screenshots or short recordings when
decoration rendering changes.

## Agent-Specific Instructions

When running shell commands as an agent, prefix commands with `rtk`, for
example `rtk pnpm test`. Exception: run `pnpm typecheck` directly because
`rtk pnpm typecheck` can leave generated `.js` files in the worktree.
