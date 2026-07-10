# Contextual Color Variables and Navigation Design

## Goal

Resolve color variables using conservative source context and provide precise
VS Code **Go to Definition** / **Peek Definition** links for CSS custom
properties, SCSS, Less, Stylus, and DTCG color aliases.

## Scope

The feature covers references whose final value resolves to a supported color:

- CSS `var(--name)` references and `--name` declarations;
- SCSS `$name`, `namespace.$name`, `@use`, `@forward`, and `@import`;
- Less `@name` references in the current document;
- Stylus `$name` and bare variable references in the current document;
- DTCG curly aliases and local or trusted relative `$ref` references in JSON,
  JSONC, YAML, and YML.

The phase does not add find-all-references, rename, completion, diagnostics, or
a persistent workspace-wide index. Those capabilities require lifecycle and
incremental-indexing decisions that are not necessary for definition links.

## User Experience

Add `color-highlight.enableColorNavigation`, defaulting to `true`. When the
extension and this setting are enabled, invoking Go to Definition or Peek
Definition on a supported color-variable reference opens the selected
declaration and selects its variable or token name.

The provider returns no result when the reference is missing, cyclic,
ambiguous, not color-valued, outside configured languages, over the configured
file-size limit, or would require a disallowed cross-file read. Existing VS
Code and third-party definition providers remain free to return their own
results.

## Architecture

### Syntax-independent result

Create a pure navigation result shared by all resolvers:

```ts
interface ColorDefinitionTarget {
  readonly originRange: { readonly start: number; readonly end: number }
  readonly targetFilePath: string
  readonly targetRange: { readonly start: number; readonly end: number }
  readonly targetSelectionRange: {
    readonly start: number
    readonly end: number
  }
}
```

`resolveColorDefinition(text, offset, context)` dispatches by language ID and
returns `ColorDefinitionTarget | null`. It has no direct VS Code UI dependency;
workspace reads continue through the existing Workspace FS helpers.

### Provider adapter

Register one DefinitionProvider for CSS, SCSS, Less, Stylus, JSON, JSONC, YAML,
and YML document selectors. The adapter:

1. checks extension/config/language/file-size/cancellation gates;
2. passes the document text, URI string, language ID, trust, and existing
   cross-file settings to the pure resolver;
3. opens the target document through `workspace.openTextDocument` when needed;
4. converts offsets into a `LocationLink` with precise origin, target, and
   target-selection ranges.

The provider is registered once during activation and disposed during
deactivation.

## Contextual CSS Resolution

Extend CSS declaration metadata with source ranges and extend each `var(...)`
usage with its enclosing normalized selector and at-rule stack.

Candidate selection is intentionally conservative:

1. prefer the latest declaration with the exact same selector and at-rule
   context as the usage;
2. otherwise select the latest candidate only when every remaining candidate
   has one identical context;
3. for configured external sources, additionally require every candidate to
   come from a trusted selector;
4. return ambiguous for every other case.

This improves common theme blocks without pretending to evaluate DOM ancestry,
specificity, media-query truth, inheritance, or runtime cascade state. Existing
fallback and cycle behavior remains unchanged. Highlight resolution and
definition navigation use the same candidate selector so their answers cannot
diverge.

## Language Resolvers

### CSS

The resolver finds the `var(...)` under the requested offset, loads the same
current/external declarations used by highlighting, applies contextual
selection, verifies that the selected chain resolves to a color, and returns
the selected declaration name range.

### SCSS

Move bounded Sass module discovery and cached Workspace FS reads into a focused
module shared by highlighting and navigation. Variable definitions retain raw
values, file paths, and name/value ranges. Navigation follows the same local,
star-imported, imported, forwarded, and namespaced module visibility rules as
highlighting. Cross-file reads require
`resolveScssVariablesAcrossFiles`, workspace trust, and a current file URI.

### Less and Stylus

Add ranged local-definition and usage collectors while retaining the existing
alias-depth and cycle rules. Navigation returns only the final color-valued
definition selected by the same last-definition-wins maps used for highlighting.
No new cross-file behavior is introduced.

### DTCG

Extend parsed token entries with a definition-name range. A navigation resolver
follows curly aliases and JSON Pointer `$ref` values with the same path decoding,
depth limit, type checks, supported extensions, 512 KiB dependency limit,
version-aware cache, trust gate, and relative-only external policy as color
resolution. The returned target is the referenced token name, including a
group `$root` token when applicable.

## Error Handling and Bounds

- Never throw from a provider request; malformed syntax and unreadable files
  produce no definition.
- Honor cancellation before parsing, after asynchronous reads, and before
  opening a target document.
- Preserve the current maximum recursion depths and dependency-file limits.
- Do not read CSS, SCSS, or DTCG dependencies unless their existing setting is
  enabled and the workspace is trusted.
- Use open unsaved document text and document versions through Workspace FS.
- Return no link for ambiguous runtime CSS contexts instead of guessing.

## Testing

Pure unit tests cover precise ranges, exact-context CSS selection, global and
ambiguous CSS fallbacks, aliases, cycles, missing/non-color variables, SCSS
namespace/star/import resolution, Less/Stylus local definitions, DTCG local and
cross-format external references, trust/setting gates, and cache invalidation.

Provider tests cover configuration, language and size gates, cancellation,
same-file and cross-file `LocationLink` conversion, target document opening,
and error isolation. Desktop and Web extension-host smoke tests must continue
to pass. The phase also runs formatting, lint, type checking, the complete unit
suite, build, benchmarks, production dependency audit, and diff checks.

## Delivery

Commit the implementation as one major feature:

```text
feat: add contextual color navigation
```
