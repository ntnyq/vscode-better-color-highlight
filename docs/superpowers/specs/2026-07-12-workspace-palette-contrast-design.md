# Workspace Palette and Contrast Diagnostics Design

## Goal

Add an on-demand, workspace-wide color palette and a low-noise contrast
workflow without introducing a persistent view, a background workspace index,
or platform-specific filesystem dependencies.

The feature has three user-facing capabilities:

1. discover, group, copy, and navigate colors used in the workspace;
2. compare any two discovered colors against WCAG 2.2 contrast thresholds;
3. optionally report deterministic low-contrast foreground/background pairs in
   open documents.

## Product Decisions

The palette uses VS Code Quick Pick rather than an Activity Bar view. It is
opened explicitly, performs a bounded scan, and releases its in-memory result
when the interaction ends. This keeps the extension lightweight and avoids a
second long-lived indexing architecture.

Contrast diagnostics are opt-in. Inferring rendered colors across selectors,
inheritance, images, gradients, themes, and runtime states would create noisy
or incorrect warnings, so diagnostics are emitted only for pairs whose
foreground and background are present in the same syntactic context.

The implementation uses the WCAG 2 relative-luminance formula and WCAG 2.2
thresholds. It does not implement APCA.

## Commands and Configuration

Add two public commands:

```text
color-highlight.showWorkspacePalette
color-highlight.checkColorContrast
```

Add these settings:

```jsonc
{
  "color-highlight.enableContrastDiagnostics": false,
  "color-highlight.workspacePaletteInclude": "**/*",
  "color-highlight.workspacePaletteExclude": "{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/coverage/**}",
}
```

`enableContrastDiagnostics` defaults to `false`. The include and exclude
patterns affect only the explicit workspace palette scan. Invalid or empty
patterns produce a user-visible error and no partial scan.

The scan has non-configurable safety bounds:

- at most 256 workspace files per invocation;
- at most 512 KiB per file;
- at most 512 dependency-file reads shared by the whole palette invocation;
- at most 2,000 retained occurrences per source file;
- at most 20,000 retained occurrences for the whole invocation;
- at most 1,024 distinct color groups;
- cancellation checks before and after every asynchronous file operation;
- unreadable, binary, and unsupported files are isolated and skipped.

When more than 256 files match, the progress message and final palette both
state that files were truncated. Progress and the final palette independently
disclose occurrence truncation. File ordering uses a locale-independent UTF-16
code-unit comparison of URI strings.

## Workspace Palette Model

Create a pure palette model with these concepts:

```ts
interface WorkspaceColorOccurrence {
  readonly color: string
  readonly end: number
  readonly sourceText: string
  readonly start: number
  readonly uri: string
}

interface WorkspaceColorGroup {
  readonly color: string
  readonly occurrences: readonly WorkspaceColorOccurrence[]
  readonly presentations: ColorPresentations
}

interface WorkspacePaletteResult {
  readonly groups: readonly WorkspaceColorGroup[]
  readonly occurrenceTruncated: boolean
  readonly scannedFileCount: number
  readonly skippedFileCount: number
  readonly truncated: boolean
}
```

`truncated` reports omission by the 256-file query cap.
`occurrenceTruncated` separately reports any omission by the per-file, global,
or distinct-group occurrence caps. Occurrences are bounded while streaming:
the scan stops opening source files at the global retained cap, while the group
cap skips only new groups so existing groups can continue collecting until a
per-file or global cap is reached.

`color` is the detector's canonical `rgb()` or `rgba()` value.
`presentations` reuses the existing HEX, RGB, HSL, and OKLCH formatter.
Occurrences are deduplicated by URI, exact range, and canonical color. Groups
are ordered by descending occurrence count, then canonical color. Occurrences
are ordered by URI and source offset.

## Scan Pipeline

The command calls `workspace.findFiles()` with the configured include/exclude
patterns and a limit of 257. The extra result determines whether the visible
256-file result is truncated.

Open, unsaved text documents override disk contents when their URI is already
in the bounded workspace query result. The palette does not bypass the include,
exclude, total-file, or dependency-read bounds for newly created or untitled
documents.

Each candidate is checked with Workspace FS metadata before it is opened
through `workspace.openTextDocument()`, which provides its language ID and
virtual-workspace-compatible text. Documents that contain a NUL character in
the first 8 KiB, exceed 512 KiB of UTF-8 text on disk or in an unsaved buffer,
fail the existing language configuration gate, or exceed
`color-highlight.maxFileSize` are skipped.

The scanner calls the existing strategy registry and concurrent detector
runner with the same configuration snapshot used by highlighting, hover, and
the native color provider. Cross-file variable, design-token, and Tailwind
reads retain their existing trust gates and per-loader bounds. They also share
a palette-level counter that rejects reads after 512 unique dependency URIs,
so 256 source documents cannot multiply into unbounded dependency work. The
palette never executes project code and remains usable in an untrusted
workspace for colors that do not require trusted dependency reads.

The optional strategy context field is deliberately small:

```ts
interface WorkspaceReadBudget {
  tryClaim(uri: string): boolean
}
```

The palette creates one case-sensitive URI-keyed budget for the entire scan.
Existing non-palette callers omit it and retain their current behavior. A
loader calls `tryClaim` immediately before its first read of a unique dependency
URI; repeated reads of an already claimed URI remain allowed and do not consume
another slot.

A single `withProgress({ cancellable: true })` operation owns the request.
Cancellation returns no stale Quick Pick. Detector failures are logged and
isolated per file; a scan succeeds when at least one candidate can be read.

## Quick Pick Interaction

`Show Workspace Palette` opens the scan progress UI, then presents one item per
color group:

- label: HEX presentation and `$(symbol-color)` icon;
- description: occurrence and file counts;
- detail: RGB, HSL, and OKLCH presentations;
- buttons: copy HEX and start contrast comparison.

Accepting a group opens an occurrence Quick Pick. Accepting an occurrence opens
the document, reveals the exact range, and selects the original color text.
The occurrence list includes a first action row for copying as HEX, RGB, HSL,
or OKLCH, so all existing presentation formats remain available without
overloading the top-level item buttons.

Quick Pick sessions handle cancellation and document deletion without errors.
A deleted occurrence is skipped with a warning and the palette remains open.

## Manual Contrast Comparison

`Check Color Contrast` obtains one bounded workspace palette result and asks
for a background color followed by a foreground color. Starting comparison
from a palette item preselects that item and asks only for its role and the
other color.

The pure contrast evaluation is a discriminated union:

```ts
type ColorContrastEvaluation =
  | {
      readonly aaaLargeText: boolean
      readonly aaaNormalText: boolean
      readonly aaLargeText: boolean
      readonly aaNormalText: boolean
      readonly effectiveForeground: RgbaColor
      readonly kind: 'determinate'
      readonly ratio: number
    }
  | {
      readonly kind: 'indeterminate'
      readonly reason: 'translucent-background'
    }
```

Rules:

- the selected background must be fully opaque;
- a translucent foreground is composited over the selected background in sRGB;
- a translucent background returns an indeterminate result because its canvas
  color is unknown;
- the displayed ratio is rounded to two decimal places, while pass/fail checks
  use the unrounded value;
- thresholds are 4.5 (AA normal), 3.0 (AA large), 7.0 (AAA normal), and 4.5
  (AAA large).

The result is shown in a final Quick Pick with its ratio and all four levels.
Actions can return to either selected palette group, copy either color, or run
another comparison. An indeterminate comparison explains why no conformance
grade is available.

## Contrast Diagnostics

Diagnostics run only when `enableContrastDiagnostics` is true and the document
passes the existing enable, language, and maximum-size gates. They are computed
for open text documents after a 200 ms debounce and are cleared immediately
when the setting is disabled or the document closes.

Create a dedicated `DiagnosticCollection` named `better-color-highlight`.
Each diagnostic uses warning severity, the foreground color range as its main
range, the background range as related information, and this message shape:

```text
Color contrast 3.82:1 is below WCAG AA 4.5:1 for normal text.
```

Only ratios below 4.5 produce diagnostics. Large-text grading remains visible
in the manual comparison because source syntax alone cannot reliably determine
the rendered font size and weight.

### CSS and inline style pairs

A bounded structural declaration scanner accepts top-level declarations inside
one CSS rule or one HTML `style` attribute. For each context, the final
syntactically valid `color` and final `background-color` declarations win.
The scanner ignores comments, strings, nested functions, custom properties,
`background` shorthand, gradients, CSS-wide keywords, and malformed blocks.

Each complete declaration value is resolved through the same color strategies
as highlighting. A value is accepted only when exactly one resolved color match
covers the complete value after whitespace and `!important` are removed.
Ambiguous, partial, composite, or unresolved values produce no pair.

### Tailwind pairs

Inside one class/className attribute, use the shared Tailwind utility parser and
theme resolver. A pair requires one resolved `text-*` utility and one resolved
`bg-*` utility with the same complete variant chain and prefix. The final
utility in each category wins. Font-size `text-*` utilities never resolve as
colors and are ignored.

Base and variant utilities are not combined across contexts. For example,
`bg-white dark:text-white` produces no pair, while
`dark:bg-black dark:text-white` does. Dynamic class expressions and incomplete
arbitrary values remain unsupported.

### Alpha and unsupported rendering

The foreground may be translucent and is composited over an opaque background.
Pairs are skipped when the background is translucent or when rendering depends
on gradients, images, blend modes, filters, opacity inherited from an ancestor,
or runtime CSS variables that the existing resolver cannot uniquely determine.

## Diagnostic Actions

Register a code action provider for diagnostics owned by this extension. It
offers:

- `Check these colors`: opens manual comparison preselected with the pair;
- `Go to foreground color`: selects the diagnostic range;
- `Go to background color`: selects the related range;
- `Disable contrast diagnostics`: updates the workspace setting to `false`.

Actions validate their URI/ranges at execution time. Stale actions fail with a
short warning instead of editing code.

## Lifecycle, Cache, and Error Isolation

The palette is explicitly on-demand and has no persistent cache. The contrast
diagnostic service keeps only the latest result and cancellation token per open
document. A text/configuration/dependency change cancels the prior run before
starting a new one.

The existing color dependency revision invalidates diagnostics when trusted
CSS, SCSS, design-token, or Tailwind sources change. Strategy errors are logged
and suppress only the affected pair or file. Diagnostics and palette scans do
not block decoration updates.

All VS Code resources, listeners, diagnostics, timers, and cancellation sources
are disposed during extension deactivation. The implementation uses Workspace
FS and VS Code document APIs only, preserving browser and virtual-workspace
compatibility.

## Testing

Pure unit tests cover palette grouping and ordering, duplicate matches, RGBA
presentations, contrast math, alpha compositing, thresholds, CSS declaration
pair parsing, inline styles, Tailwind variant grouping, malformed syntax, and
false-positive isolation.

Workspace tests cover include/exclude patterns, the 256-file, 512 KiB, and
512-dependency bounds, deterministic ordering of the returned bounded set,
unsaved-document precedence, binary/unreadable files, language and trust gates,
cancellation, progress, detector failures, virtual URIs, Quick Pick navigation,
copy actions, and deleted occurrences.

Diagnostic tests cover opt-in lifecycle, debounce/cancellation, dependency
revision invalidation, exact ranges and related information, setting changes,
code actions, stale ranges, and document close. Existing highlight, hover,
provider, navigation, command, metadata, README, snapshot, and Web build tests
must remain green.

Full verification includes formatting, lint, type checking, unit tests, desktop
and Web builds, Electron and Web extension-host smoke tests, benchmarks,
production dependency audit, and staged diff checks.

## Non-Goals

- persistent Activity Bar or Tree View UI;
- a continuously maintained workspace color index;
- automatic source rewriting or color replacement from diagnostics;
- cross-selector cascade, inheritance, layout, or DOM rendering inference;
- image, gradient, blend-mode, filter, or unknown-canvas contrast analysis;
- APCA scoring;
- scanning outside workspace folders or executing project configuration.

## Delivery

Commit the validated design separately, commit the implementation plan
separately, then consolidate implementation tasks into one major feature commit:

```text
feat: add workspace palette and contrast diagnostics
```
