# Tailwind CSS v4 Theme Color Design

> **Status:** Implemented on 2026-07-11 in `8faa5bb`.
>
> This is a historical design record, not a roadmap. Refer to the
> [project README](../../README.md), runtime source, and tests for current
> behavior.

## Goal

Upgrade Tailwind color highlighting from a hard-coded v3 default palette to a
v3-compatible, Tailwind CSS v4.3-aware theme resolver that understands CSS-first
`@theme` configuration, custom colors, imports/references, modern utility
syntax, and theme-definition navigation.

## Standards Baseline

The implementation follows the current Tailwind CSS v4.3 documentation and
official `tailwindcss/colors` export:

- `--color-*` theme variables create color utilities;
- default v4 colors are OKLCH values;
- `--color-*: initial` and `--*: initial` remove the default color namespace;
- `@theme`, `@theme inline`, and `@theme static` all define theme variables;
- shared theme CSS may be loaded through relative `@import` and `@reference`;
- slash opacity accepts percentages, numeric percentages, arbitrary values,
  and CSS-variable shorthand;
- arbitrary color values use bracket or parenthesized custom-property syntax.

## User Configuration

Add two settings:

```jsonc
{
  "color-highlight.tailwindColorMode": "auto",
  "color-highlight.tailwindStylesheetPaths": [],
}
```

`tailwindColorMode` accepts:

- `auto` (default): use the v4 palette when the current or loaded theme sources
  contain v4 signals (`@theme`, `@reference`, or an import of `tailwindcss`),
  otherwise retain the existing v3 palette;
- `v3`: always use the existing legacy palette plus custom declarations;
- `v4`: always use the official bundled v4 palette plus custom declarations.

`tailwindStylesheetPaths` contains files, directories, or glob patterns used as
explicit theme sources for markup and script documents. An empty array keeps
cross-file theme loading disabled. Reads require workspace trust.

## Architecture

### Theme model

Create a syntax-independent `TailwindColorTheme` containing:

- the selected base palette;
- ranged custom `--color-*` declarations in source order;
- uniquely resolvable regular custom properties used by `@theme inline`;
- whether a namespace reset has occurred;
- file and range metadata for custom-theme navigation.

One resolver produces both a canonical color and, when applicable, the final
custom declaration target. Highlight, hover, native color provider, and Go to
Definition therefore cannot disagree.

### Palette sources

Keep the current v3 palette in a focused legacy module. Add `tailwindcss` as a
runtime dependency and consume only its official `tailwindcss/colors` export
for the v4 palette. The bundler must inline and tree-shake this browser-safe
data; no Tailwind compiler or Node API is executed at extension runtime.

Convert palette values through the extension's existing color parsers so
OKLCH, hex, named colors, and alpha all produce the canonical `rgb()`/`rgba()`
representation.

### Theme parsing and cascade

Parse only top-level `@theme`, `@theme inline`, and `@theme static` blocks.
Nested `@theme` blocks are malformed and ignored. Preserve declaration order.

Apply declarations in order:

1. start with the selected v3 or v4 base palette;
2. `--*: initial` or `--color-*: initial` clears all colors;
3. `--color-name: initial` removes that color;
4. a supported direct color sets/replaces the color;
5. an exact `var(--color-other)` alias follows the theme chain;
6. `@theme inline` may also follow a uniquely resolvable regular custom
   property; multiple selector/at-rule contexts remain ambiguous and produce no
   color;
7. missing values, cycles, unsupported composite values, and ambiguous aliases
   produce no match rather than a guess.

The parser recognizes comments, strings, nested functions, and semicolons
inside functions without corrupting ranges.

### Cross-file loading

Expand configured files/directories/globs with Workspace FS. From each source,
follow only relative CSS `@import` and `@reference` directives. Package, HTTP,
data, and absolute references are not followed. An import of `tailwindcss` is a
v4 signal but uses the bundled palette instead of reading package internals.

Bounds per detector/navigation request:

- maximum 32 theme files;
- maximum relative import/reference depth 5;
- maximum 512 KiB per file;
- version-aware cache keyed by open-document version, mtime, and size.

The color dependency revision watcher includes CSS changes whenever
`tailwindStylesheetPaths` is non-empty. Highlight and hover cache signatures
include both new settings.

### Utility parsing

Replace the palette-name-specific anchor with a bounded class-token scanner.
It continues to support variants, arbitrary variants, `!important`, negative
prefix rejection, all existing color utility prefixes, gradients, SVG colors,
shadows, rings, borders, and slash opacity.

Add v4 syntax:

- custom theme names such as `bg-brand` and `text-brand-muted`;
- new official palette families from the installed v4 colors export;
- bracket colors such as `bg-[#50d71e]` and `text-[oklch(...)]`;
- parenthesized custom properties such as `bg-(--color-brand)`;
- slash opacity on named, bracket, and parenthesized values;
- v4 trailing important modifiers such as `bg-red-500!`, while retaining the
  deprecated v3-compatible leading form;
- v4 prefix variants such as `tw:bg-red-500` and `tw:hover:bg-red-600`.

Dynamic template fragments and arbitrary expressions that are not complete
supported colors are skipped. Arbitrary values decode Tailwind underscore
whitespace and escaped underscores before color parsing.

## Navigation

Extend the color definition dispatcher to recognize a Tailwind utility at the
cursor in HTML, JSX/TSX, Vue, Svelte, Astro, CSS, SCSS, Less, and other enabled
non-JSON documents. A definition link is returned only when the resolved final
color comes from a custom `--color-*` or uniquely resolvable inline property.
Bundled default palette colors have no workspace definition and return no link.

The provider reuses the same loaded theme and does not add unbounded workspace
search. Configuration, language, trust, file-size, cancellation, and error
isolation gates remain unchanged.

## Error Handling and Compatibility

- `auto` preserves v3 colors in projects without v4 signals.
- Existing v3 utilities, variants, opacity behavior, and source ranges remain
  covered by regression tests.
- Invalid or unreadable sources are isolated and skipped.
- Untrusted workspaces never read configured theme files.
- Open unsaved theme files override disk contents through Workspace FS.
- The feature remains browser/virtual-workspace compatible.
- No Tailwind compiler, JavaScript config execution, package plugin execution,
  or arbitrary code evaluation is introduced.

## Testing

Unit tests cover v3/v4/auto palette selection, official v4 OKLCH colors and new
families, direct/aliased/inline/static theme values, resets/removals, source
order, malformed/nested blocks, cycles, precise ranges, imports/references,
trust/bounds/cache/unsaved files, arbitrary syntax, opacity, variants,
important modifiers, false positives, and definition targets.

Integration tests cover strategy-context propagation, dependency invalidation,
highlight/hover/provider behavior, playground snapshots, and provider selector
registration. Desktop and Web extension-host smoke tests, build, benchmarks,
production dependency audit, formatting, lint, type checking, and full unit
tests must pass.

## Delivery

Commit the implementation as one major feature:

```text
feat: support Tailwind CSS v4 themes
```
