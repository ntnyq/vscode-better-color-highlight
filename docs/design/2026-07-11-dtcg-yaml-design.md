# DTCG and YAML Design Token Design

> **Status:** Implemented on 2026-07-11 in `4baf287`.
>
> This is a historical design record, not a roadmap. Refer to the
> [project README](../../README.md), runtime source, and tests for current
> behavior.

## Summary

Extend design-token highlighting from legacy JSON string values to the stable
DTCG 2025.10 format, including structured color objects, inherited color types,
curly-brace aliases, JSON Pointer references, relative cross-file references,
and YAML input.

The implementation preserves current JSON/JSONC string matching modes and adds
structured parsing without broadening unrelated YAML string detection.

## Standards Baseline

The implementation targets the final community reports published on
28 October 2025:

- [Design Tokens Format Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)
- [Design Tokens Color Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-color-20251028/)

It supports the specification's required complete-token curly references and
JSON Pointer `$ref` references. Relative file references are an extension for
workspace-based design systems.

## Goals

- Highlight DTCG `$type: "color"` structured `$value` objects.
- Inherit `$type: "color"` from the nearest parent group.
- Support all specified color spaces: `srgb`, `srgb-linear`, `hsl`, `hwb`,
  `lab`, `lch`, `oklab`, `oklch`, `display-p3`, `a98-rgb`, `prophoto-rgb`,
  `rec2020`, `xyz-d65`, and `xyz-d50`.
- Support optional alpha and 6-digit hex fallback values.
- Resolve `{group.token}` aliases, `#/...` JSON Pointers, chained references,
  and detect cycles.
- Support relative external pointers such as
  `./base.tokens.json#/colors/blue/$value` when explicitly enabled.
- Parse JSON, JSONC, YAML, YML, and JSON-formatted `.tokens` documents with
  source ranges suitable for decorations and native color providers.
- Preserve existing legacy JSON `value` / `$value` string behavior and broad
  string modes.
- Refresh consumers when open or on-disk token dependencies change.
- Work in desktop, Web, and virtual workspaces through the VS Code Workspace FS
  abstraction.

## Non-Goals

- `$extends` group inheritance.
- Remote HTTP references or package resolution.
- Guessing colors from untyped DTCG object values.
- YAML-wide arbitrary string matching.
- Editing or rewriting token documents.
- Treating YAML anchors as DTCG aliases.

## Approaches Considered

### 1. Regex extensions

Extend the existing JSON string scanner with expressions for structured values
and add line-oriented YAML matching. This has no dependencies but cannot safely
handle nesting, inherited types, references, comments, quoting, or reliable
source ranges.

### 2. Source AST adapters feeding one token resolver

Use `jsonc-parser` for JSON/JSONC and `yaml` for YAML CST/AST ranges. Both
adapters produce the same token-entry model, and one resolver handles types,
references, cycles, and colors. This is the recommended approach because syntax
concerns remain isolated while semantic behavior is shared.

### 3. Language server

Build a persistent token language service with diagnostics, definitions,
references, and indexing in one phase. This would serve later navigation work,
but it is too broad for the parsing and highlighting milestone.

## Dependencies

- `jsonc-parser` `^3.3.1` for tolerant JSON/JSONC ASTs and source offsets.
- `yaml` `^2.9.0` for YAML documents, node ranges, and browser-compatible
  parsing.

Both are runtime dependencies and are bundled by the existing tsdown policy.

## Architecture

### Shared token model

`src/strategies/design-tokens/types.ts` defines:

```ts
export interface DesignTokenRange {
  readonly start: number
  readonly end: number
}

export interface DesignTokenEntry {
  readonly path: readonly string[]
  readonly type?: string
  readonly value?: unknown
  readonly reference?: string
  readonly range: DesignTokenRange
}

export interface ParsedDesignTokenDocument {
  readonly root: unknown
  readonly tokens: readonly DesignTokenEntry[]
}
```

The range points to the source expression representing the token: a structured
color's `components` sequence, an alias string, or a `$ref` string.

### Syntax adapters

`parseJsonDesignTokenDocument(text)` walks a `jsonc-parser` tree. Objects with
`$value` or `$ref` are tokens; other objects are groups. It carries the nearest
group `$type`, extracts JavaScript values, and keeps exact node ranges. The
existing legacy string scanner remains responsible for current `strings` mode
and escaped-string compatibility.

`parseYamlDesignTokenDocument(text)` walks `yaml` map, pair, scalar, and sequence
nodes with the same group/token rules. Parser errors return no structured token
entries. YAML strategy matching is conservative and scans token values only.

### Semantic resolver

`resolveDesignTokenColors(document, loader?)` indexes tokens by path, then
resolves each candidate lazily with a maximum depth of 32 and a path stack.

- Explicit or inherited `color` type is required for concrete values.
- An alias without an explicit type inherits the resolved target token's type.
- `{a.b}` targets the complete `$value` of token path `a.b`.
- `#/a/b/$value` follows RFC 6901 escaping and array indices.
- A token containing `$ref` uses its reference as the value source.
- Missing targets, type mismatches, malformed pointers, and cycles produce no
  color match.

Relative references split into a file part and fragment. They are loaded only
when `resolveDesignTokensAcrossFiles` is true and the workspace is trusted. The
loader accepts `.json`, `.jsonc`, `.tokens`, `.yaml`, and `.yml`, resolves paths
relative to the referring file, and reuses a metadata/version cache.

### Color conversion

`resolveDtcgColor(value)` validates three components and alpha, then delegates
to existing conversion utilities:

- RGB-like and XYZ spaces use `colorSpaceToRgb()`.
- HSL uses `hslToRgb()` with percentages normalized from 0-100.
- HWB uses `hwbToRgb()` with percentages normalized from 0-100.
- Lab/LCH/OKLab/OKLCH use their existing direct converters.
- Results use `rgbString()` and preserve alpha.

Bounded component ranges follow the Color Module. Unbounded channels must still
be finite. A `none` component uses a valid 6-digit `hex` fallback plus the
structured alpha; without that fallback the color is skipped.

### Strategy integration

The JSON strategy combines legacy string results with structured DTCG results
when mode is `token-values` or `all`. Mode `strings` remains string-only and
`off` remains disabled.

A new YAML strategy is registered only for `yaml` documents and returns token
value matches. General literal detectors are not run over YAML by default, which
avoids highlighting unrelated configuration strings.

### Cross-file invalidation

Add `color-highlight.resolveDesignTokensAcrossFiles`, default `false`.

Generalize `useStylesheetDependencyRevision` into
`useColorDependencyRevision`. When design-token resolution is enabled, it also
watches JSON/JSONC/`.tokens`/YAML files and open-document changes. Highlight and
hover continue to consume the single revision ref.

## Data Flow

1. The strategy registry selects JSON or YAML design-token detection.
2. The syntax adapter produces token entries and source ranges.
3. The resolver indexes local entries and resolves concrete values or aliases.
4. Relative `$ref` values optionally load trusted workspace documents.
5. Structured color validation converts the value to the extension's canonical
   `rgb()` / `rgba()` representation.
6. Matches flow unchanged to decorations, hover, and the native color provider.
7. Dependency changes increment the shared revision and invalidate consumers.

## Error Handling

- Syntax errors do not throw out of a detector; valid legacy JSON strings may
  still be returned.
- Invalid structured values, unsupported shapes, missing references, and type
  mismatches are skipped.
- Circular local or external reference chains are detected by canonical
  document URI plus token path.
- External reads are disabled in untrusted workspaces and when the setting is
  false.
- External documents larger than 512 KiB are skipped.
- `none` never silently becomes zero; fallback or skip is required.

## Testing

- Color conversion tests cover every supported space, alpha, invalid ranges,
  fallback, and `none`.
- Resolver tests cover inherited types, curly aliases, JSON Pointer escaping,
  chains, missing targets, type mismatches, and cycles.
- JSON/JSONC tests cover structured ranges without changing legacy snapshots.
- YAML tests cover block/flow values, comments, quoted aliases, inherited type,
  invalid syntax, and exact ranges.
- Cross-file tests cover trusted/disabled/untrusted modes, unsaved open files,
  relative JSON-to-YAML references, caching, and cycles.
- Registry, dependency revision, highlight, hover, native provider, playground
  snapshots, desktop E2E, and Web E2E remain green.

## Documentation

README will mark YAML Design Tokens complete, describe DTCG objects and aliases,
document the cross-file setting, and include JSON and YAML examples.

## Commit Boundary

The complete phase is one implementation commit:

`feat: support DTCG and YAML design tokens`
