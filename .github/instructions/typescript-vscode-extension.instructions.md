---
applyTo: 'src/**/*.ts, tests/**/*.ts'
description: 'Use when changing TypeScript code in this VS Code extension. Preserve the pure-core/reactive-shell architecture, reactive-vscode patterns, normalized color matching behavior, and Vitest coverage.'
---

# TypeScript VS Code extension guidance

- Keep parsing, color conversion, and matching logic in pure modules under `src/color/`, `src/core/`, and `src/strategies/`.
- Keep VS Code API usage and reactive-vscode wiring in `src/composables/`, `src/decorations/`, and `src/commands/`.
- Preserve the normalized `ColorMatch` shape and existing strategy ordering unless a bug specifically requires changing precedence.
- When editing color or variable detection, update or add focused Vitest tests in `tests/`.
- If settings or commands change in `package.json`, regenerate `src/meta.ts` instead of editing it by hand.
- Match repository style: strict TypeScript, small functions, single quotes, no semicolons, 2-space indentation.
