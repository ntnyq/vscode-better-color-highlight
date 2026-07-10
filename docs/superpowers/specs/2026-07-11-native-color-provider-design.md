# Native Color Provider Design

## Summary

Add an optional VS Code `DocumentColorProvider` backed by the extension's
existing detectors. When enabled, VS Code can show its native color swatch and
picker for colors understood by Better Color Highlight, including formats and
languages that built-in providers do not resolve.

The feature is disabled by default. Existing custom decorations and hover
actions remain unchanged.

## Goals

- Add `color-highlight.enableColorPicker`, defaulting to `false`.
- Return native `ColorInformation` ranges for the same resolved matches used by
  custom highlighting.
- Offer HEX, RGB, HSL, and OKLCH native replacement presentations.
- Respect extension enablement, language filters, maximum file size, workspace
  trust, cross-file settings, and cancellation.
- Work in desktop, Web, and virtual workspaces without Node runtime APIs.
- Share detector execution and per-detector error isolation across custom
  highlighting, hover, and the native provider.

## Non-Goals

- Replacing the existing decoration renderer.
- Enabling the native picker by default.
- Suppressing VS Code's built-in providers or trying to merge their results.
- Adding new color syntaxes.
- Changing source formatting beyond the four existing presentation formats.

## Approaches Considered

### 1. Provider-specific detector loop

Run `getStrategies()` directly inside the provider and duplicate the error
handling already present in highlighting and hover. This is the smallest patch,
but creates a third detector execution implementation that can drift.

### 2. Shared detector runner with a provider adapter

Extract a small `runColorDetectors()` core function that receives detectors,
text, strategy context, and optional callbacks. Existing highlighting and hover
use it, while the provider converts its matches into VS Code API objects. This
is the recommended approach because it deepens one stable module boundary
without changing parser behavior.

### 3. New workspace-wide color index

Build a persistent occurrence index and have decorations, hover, and the native
provider query it. This is useful for a future palette explorer, but is too much
state and invalidation complexity for the native picker phase.

## Architecture

### Shared detector execution

`src/core/color-detection.ts` exports:

```ts
export interface RunColorDetectorsOptions {
  readonly context: StrategyContext
  readonly detectors: readonly ColorDetector[]
  readonly onDetectorError?: (message: string) => void
  readonly onDetectorResult?: (
    name: string,
    matches: readonly ColorMatch[],
  ) => void
  readonly text: string
}

export async function runColorDetectors(
  options: RunColorDetectorsOptions,
): Promise<ColorMatch[]>
```

It runs detectors concurrently, catches failures per detector, reports optional
diagnostics, and flattens successful matches. It does not read configuration or
VS Code state.

`useColorHighlight` keeps responsibility for eligibility, configuration, stale
run cancellation, logging, and applying decorations. `getColorHover` keeps its
versioned match cache and delegates only the uncached detector execution.

### Provider adapter

`src/color-provider/document-color-provider.ts` exports the two provider
operations:

```ts
export async function provideDocumentColors(
  document: TextDocument,
  cancellationToken: CancellationToken,
): Promise<ColorInformation[]>

export function provideColorPresentations(
  color: Color,
  context: { readonly document: TextDocument; readonly range: Range },
): ColorPresentation[]
```

Document colors are skipped when the extension or picker is disabled, the
language is excluded, the text exceeds `maxFileSize`, or cancellation is
requested. Applicable strategies receive the same `StrategyContext` fields as
highlighting and hover.

Resolved `rgb()` / `rgba()` strings are parsed through the existing
`parseResolvedColor()` utility. RGB bytes are normalized to VS Code's 0-1
`Color` channels. Invalid resolved strings are skipped. Duplicate
range-and-color matches are removed before `ColorInformation` objects are
created.

Native presentations convert VS Code's normalized color back to byte channels,
reuse `getColorPresentationsFromRgba()`, and attach a `TextEdit.replace()` for
HEX, RGB, HSL, and OKLCH labels.

### Registration and configuration

`src/composables/use-color-provider.ts` registers one provider for `'*'` and
disposes it on extension deactivation. The provider reads reactive configuration
at request time, so toggling `enableColorPicker` does not require re-registration.

`src/index.ts` activates the composable. `package.json`, generated `src/meta.ts`,
and README configuration documentation expose the new setting.

## Data Flow

1. VS Code requests document colors.
2. The provider validates configuration, language, size, trust, and cancellation.
3. The strategy registry selects detectors for the document language.
4. `runColorDetectors()` executes them with isolated failure handling.
5. The provider checks cancellation again, deduplicates matches, parses resolved
   colors, and maps offsets to document ranges.
6. VS Code requests presentations for a selected native swatch.
7. The provider returns four labels and edits using existing formatters.

## Error Handling

- One failed detector is logged and contributes no matches; other detectors
  continue.
- Cancellation before or after detector execution returns an empty result.
- Unsupported resolved color strings are ignored instead of throwing.
- Invalid document ranges are prevented by using detector offsets and the
  document's `positionAt()` conversion.
- Presentation conversion clamps normalized channels through the existing
  formatter inputs.

## Testing

- Unit tests prove shared detector concurrency, result flattening, callback
  reporting, and per-detector failure isolation.
- Unit tests prove provider eligibility, range mapping, deduplication, normalized
  channel conversion, cancellation, and four replacement presentations.
- Metadata and README tests prove the setting exists and defaults to false.
- Existing highlight and hover suites prove the shared-runner refactor preserves
  behavior.
- Full unit, typecheck, lint, build, desktop E2E, and Web E2E gates pass.

## Commit Boundary

The complete feature is one implementation commit:

`feat: add native color provider`
