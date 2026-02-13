# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Project Overview

VS Code extension "Better Color Highlight" that highlights and previews colors in multiple formats (hex, rgb, hsl, hwb, lch, oklch, lab, oklab, named colors, CSS/Less/SCSS/Stylus variables) across code, comments, and strings. Built on the **reactive-vscode** framework with a pure core / reactive shell architecture.

## Commands

```bash
pnpm dev           # Watch mode development build
pnpm build         # Production build (minified, no sourcemaps)
pnpm lint          # Lint with oxlint
pnpm format        # Format with oxfmt
pnpm format:check  # Check formatting
pnpm typecheck     # Type-check with tsgo (native Go TS compiler)
pnpm test          # Run vitest unit tests
pnpm test:watch    # Run vitest in watch mode
pnpm generate:meta # Regenerate src/meta.ts from package.json contributes
pnpm pack          # Package as .vsix
pnpm release:check # Pre-release checks (format:check + lint + typecheck)
```

## Architecture: Pure Core / Reactive Shell

- **Pure layer** (`src/core/`, `src/strategies/`, `src/color/`): All color detection and conversion logic is pure functions with zero VS Code dependency. Fully unit-testable.
- **Reactive shell** (`src/composables/`): Uses reactive-vscode APIs (`useVisibleTextEditors`, `useDocumentText`, `defineConfig`, `watchEffect`) for reactive data flow.
- **Decoration layer** (`src/decorations/`): `DecorationTypeCache` + `editor.setDecorations()` for rendering (hybrid: reactive tracking, imperative rendering for N unique colors).

### Key source directories

- **`src/core/types.ts`** — `ColorMatch`, `ColorDetector`, `StrategyContext`, `MarkerType`, `HighlightConfig`
- **`src/core/strategy-registry.ts`** — `getStrategies(languageId, config)` selects applicable strategies based on language and config
- **`src/core/color-match.ts`** — `groupByColor()`, `mergeMatches()` utilities
- **`src/strategies/`** — Each file is a `ColorDetector` function: `hex`, `color-functions`, `hwb`, `named-colors`, `rgb-no-fn`, `hsl-no-fn`, `css-vars`, `less-vars`, `scss-vars`, `stylus-vars`
- **`src/color/`** — `named-color-map.ts` (148 CSS colors), `convert.ts` (hexToRgb, hslToRgb, hwbToRgb, lchToRgb, oklchToRgb, labToRgb, oklabToRgb), `contrast.ts` (WCAG 2.0)
- **`src/decorations/`** — `marker-types.ts` (6 decoration styles), `decoration-type.ts` (cache of TextEditorDecorationType)
- **`src/composables/use-color-highlight.ts`** — Main composable: reactive pipeline from document change to decoration
- **`src/config.ts`** — `defineConfig()` + `getHighlightConfig()` helper
- **`src/meta.ts`** — **Auto-generated** by `vscode-ext-gen`. Do not edit manually.

### Data flow

```
useVisibleTextEditors() → for each editor:
  useDocumentText(doc) → debounced (100ms) →
  getStrategies(languageId, config) → run all via Promise.all →
  groupByColor() → editor.setDecorations() for each color
```

### reactive-vscode patterns

- `defineExtension()` — creates activate/deactivate exports
- `defineConfig()` — typed reactive configuration (access via `config['color-highlight'].enable`)
- `useCommand()` — registers VS Code commands
- `useVisibleTextEditors()` — reactive tracking of visible editors
- `useDocumentText(doc)` — reactive document text

## Tooling

- **Package manager**: pnpm (workspace mode with `playground/`)
- **Bundler**: tsdown (Rolldown-based)
- **Type checker**: tsgo (`@typescript/native-preview`) — native Go TS compiler
- **Linter**: oxlint (Oxc-based ESLint alternative) — config in `.oxlintrc.jsonc`
- **Formatter**: oxfmt (Oxc-based Prettier alternative) — config in `.oxfmtrc.jsonc`
  - No semicolons, single quotes, trailing commas, 2-space indent, 80 print width
- **Test**: vitest — unit tests for pure modules (color conversion, contrast, all strategies, registry)
- **Pre-commit**: husky + nano-staged (runs oxlint --fix and oxfmt on staged files)
- **Meta generation**: `vscode-ext-gen` generates `src/meta.ts` from `package.json` contributes section. Run `pnpm generate:meta` after editing commands/configs in package.json.

## Workspace

The pnpm workspace includes `playground/` — a minimal VS Code workspace for testing the extension during development with F5/debug launch.
