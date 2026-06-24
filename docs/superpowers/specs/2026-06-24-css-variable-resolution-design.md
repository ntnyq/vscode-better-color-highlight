# CSS Variable Resolution Design

Date: 2026-06-24

## Goal

Add optional CSS custom property resolution so `var(--name)` usages can be
highlighted with the resolved color when the result is predictable.

The feature must be disabled by default. When enabled, it should support a
configured list of CSS variable source paths while avoiding misleading
highlights for runtime-dependent cascade cases.

## Background

The upstream color-highlight issue asks for CSS variable support in color
decorations. The discussion notes that VS Code can identify same-file CSS
custom properties for IntelliSense, but VS Code does not fully resolve custom
property color decorators because the active value depends on runtime selector
matching, inheritance, cascade, layers, media conditions, and DOM structure.

The CSS Custom Properties spec treats custom properties as ordinary inherited
properties. Their values are computed on the element where `var()` is used, and
cycles make involved variables invalid at computed-value time. The fallback
argument to `var()` is used only when the referenced custom property has no
usable value.

This extension should therefore prefer a conservative resolver: missing a
highlight is acceptable; showing the wrong color is not.

## Configuration

Add three settings:

- `color-highlight.resolveCssVariablesAcrossFiles`
  - Type: `boolean`
  - Default: `false`
  - Enables reading configured CSS variable source paths.
- `color-highlight.cssVariablePaths`
  - Type: `string[]`
  - Default: `[]`
  - File, directory, or glob paths used as external CSS variable sources.
- `color-highlight.cssVariableTrustedSelectors`
  - Type: `string[]`
  - Default: `[":root", "html", "body", ":host"]`
  - Selectors whose custom property declarations are allowed to participate in
    cross-file resolution.

`cssVariablePaths` accepts absolute paths and relative paths. Relative paths
resolve from the workspace folder when available, and from the current file
directory when there is no workspace folder.

Directory and glob support should include CSS-like source files needed by this
extension, starting with `.css`, `.scss`, and `.less`.

## Architecture

Extend the existing CSS variable strategy instead of adding a second competing
strategy.

The resolver is split into three units:

- Source loader: reads the current document and configured external files with
  the existing workspace file-system helpers.
- Variable index: collects custom property declarations and stores metadata
  about name, value, file, source order, selector, specificity, and confidence.
- Resolver: resolves `var()` usages through direct values, nested variables,
  and fallbacks, while detecting cycles.

The current document always uses the in-memory text passed to the strategy.
External files are read only when
`resolveCssVariablesAcrossFiles === true`.

## Trusted Selector Rules

A custom property declaration from an external file is high-confidence only when
the selector for its rule is trusted.

For comma-separated selectors, every selector item must be trusted:

```css
:root,
html {
  --brand: #0ea5e9;
}
```

This is trusted with the default config.

```css
:root,
[data-theme='dark'] {
  --brand: white;
}
```

This is not trusted unless both selector items are configured as trusted.

Users can opt into project-specific theme selectors:

```json
{
  "color-highlight.cssVariableTrustedSelectors": [
    ":root",
    "html",
    "body",
    ":host",
    "[data-theme='light']",
    "html[data-theme='light']"
  ]
}
```

Selector matching is exact after whitespace normalization. The first version
does not support selector pattern matching.

## Cascade Approximation

The resolver only compares declarations that already passed the trusted selector
filter.

Conflict ordering:

1. Current document declarations take precedence over external files.
2. External files follow configured path order; later configured paths can
   override earlier paths.
3. Within one file, later declarations can override earlier declarations.
4. Within trusted selectors, specificity is used before source order.

If two high-confidence candidates cannot be ordered deterministically, the
resolver skips that variable.

If an untrusted declaration for the same variable is present in an external
source file, the resolver treats the external variable as ambiguous by default
and skips the cross-file highlight. This does not change existing current-file
resolution behavior. The rule avoids showing a global token color when a theme
or component override may be active.

## Resolution Semantics

For each `var(--name, fallback)` usage:

1. Look up a high-confidence declaration for `--name`.
2. Resolve its value as a direct color with the existing color strategies.
3. Resolve nested `var()` references recursively.
4. If the declaration is missing, ambiguous, invalid, or cyclic, resolve the
   fallback when present.
5. If no color is found, return no match.

Resolved matches highlight the whole `var(...)` range, matching existing
same-file CSS variable behavior.

Custom property names remain case-sensitive.

`!important` is ignored in value parsing as it is already removed from custom
property values by CSS parsing semantics and the existing strategy strips it for
practical matching.

## Path And Import Scope

The first version reads only the current document and `cssVariablePaths`.

It does not automatically follow `@import`, because CSS import resolution brings
additional semantics for URLs, media conditions, layers, package resolution, and
load order. A later setting such as `resolveCssVariableImports` can be designed
separately if needed.

## Caching And Limits

Use a process-level external file cache keyed by URI plus `mtimeMs` and `size`.
Current document text is never cached from disk.

Suggested initial limits:

- Maximum external files per run: 64
- Maximum external file size: 512 KB
- Maximum nested variable resolution depth: 16
- Maximum external file content cache entries: 256

When a limit is exceeded, skip the affected file or variable and log only when
`color-highlight.debug` is enabled.

## Error Handling

External file read failures do not fail the whole highlight run.

The resolver returns no match for:

- Missing variables
- Ambiguous candidates
- Cycles
- Invalid fallbacks
- Values that do not resolve to colors
- Files that cannot be read
- Files that exceed configured or internal limits

Debug logging should explain skipped files, ambiguous variables, and cycle
detection without logging during normal operation.

## Testing

Add focused Vitest coverage for:

- Current-file CSS variable behavior remains unchanged.
- Cross-file CSS variable resolution is disabled by default.
- Enabling `resolveCssVariablesAcrossFiles` reads configured paths.
- `:root` variables from configured paths highlight `var()` usages.
- Nested variables resolve.
- Fallbacks resolve, including fallback values that contain another `var()`.
- Cycles do not highlight.
- Custom property names are case-sensitive.
- Default trusted selectors are honored.
- Custom trusted selectors are honored.
- Untrusted selectors do not participate in cross-file highlights.
- Ambiguous trusted declarations are skipped.
- External untrusted same-name declarations make cross-file resolution
  ambiguous.
- Later configured paths override earlier configured paths when trusted.
- File read failures do not throw.
- External file cache invalidates when `mtimeMs` or `size` changes.

Add or update playground snapshot coverage for a configured cross-file token
file once the implementation can inject test context.

Run:

```bash
pnpm test
pnpm typecheck
```

## Non-Goals

- Full DOM-aware CSS cascade evaluation.
- Runtime theme detection.
- Automatic `@import` graph traversal.
- CSS cascade layer evaluation.
- Media query evaluation.
- Selector pattern matching in trusted selector config.
- Color decorators for CSS variables outside existing decoration behavior.

## References

- https://github.com/iamsergii/vscode-ext-color-highlight/issues/73
- https://github.com/iamsergii/vscode-ext-color-highlight/pull/75
- https://github.com/microsoft/vscode/issues/173923
- https://github.com/microsoft/vscode/issues/28459
- https://github.com/microsoft/vscode-css-languageservice/issues/156
- https://www.w3.org/TR/css-variables-1/
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/var
- https://github.com/microsoft/vscode-css-languageservice/blob/main/src/services/cssCompletion.ts
