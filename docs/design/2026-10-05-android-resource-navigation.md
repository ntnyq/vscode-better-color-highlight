# Android resource-reference navigation

Status: implemented for the release after v0.8.0.

## Behavior

Go to Definition and Peek Definition on a complete XML `@color/name` value
follow local aliases to the terminal static `<color name="...">` or
`<item type="color" name="...">` declaration. The origin range covers the
reference, the target range covers the declaration, and the target selection
covers its name. Offsets use the original UTF-16 source, including comments
and non-ASCII prefixes.

The feature uses `color-highlight.enableColorNavigation`, which defaults to
true. Resource indexing requires workspace trust. It does not add reference
highlighting, picker replacements, or Java/Kotlin `R.color` navigation.

## Resource boundaries

- The source must be an XML file directly inside a recognized Android resource
  directory, such as `res/layout`, `res/drawable`, or `res/values`, including
  qualified directory names. `res/raw` is excluded.
- The enclosing `res` directory is the entire resolution scope. Other modules,
  source sets, Gradle overlays, dependency packages, generated resources, and
  manifest references are not merged or inferred.
- Static declarations are read from immediate `res/values/*.xml` files. A name
  is blocked if it appears more than once, appears in any `values-*` directory,
  or has a matching XML file in `color` or `color-*`. A qualifier on any step of
  an alias chain blocks navigation, even when the values happen to be equal.
- Unrelated qualified names do not block a unique unqualified name. A reference
  from a qualified layout can navigate when the entire target chain is unique
  and unqualified.
- Terminal values accept the four Android hexadecimal lengths. Missing names,
  cycles, theme attributes, package-qualified references, state lists, and
  arbitrary expressions return no target.

## Parsing and bounded I/O

The structural XML scanner tracks quoted attributes, balanced elements, and
comments. It only recognizes complete attribute or leaf-text references;
comments, tooling attributes, CDATA, interpolated strings, and data-binding
expressions do not supply references. CDATA is opaque, so unrelated strings
containing it do not invalidate the resource index. Static color values inside
CDATA or mixed markup are not resolved. Encoded resource names/types and DTDs
are unsupported; malformed or unsupported source documents reject the index
rather than potentially hiding another definition.

Directory enumeration uses `workspace.fs` through the existing shared adapter,
so it supports desktop and virtual filesystems without relying on a search
index or search exclusions. Symbolic links are not followed. Each request
allows at most 64 resource directories, 64 XML files, 4,096 entries in one
directory listing, and 512 KiB per resource file. XML parsing permits at most
20,000 elements and 128 nesting levels; alias traversal permits 64 declarations.
Directory reads and file reads also claim the shared workspace read budget.
Cancellation is checked before and after asynchronous I/O. Any incomplete,
unreadable, malformed, or over-budget index produces no result.

## Freshness and validation

Each navigation request rebuilds its resource index. Open editor contents take
precedence over disk contents; no persistent cache or filesystem watcher is
needed. The provider discards results if the source closes or changes during
resolution. Before returning a link it also compares the opened target with
the indexed target snapshot, avoiding stale selection ranges.

Unit coverage includes normal chains, duplicates, qualifiers, cycles, file
changes, cancellation, bounds, trust, exact ranges, Windows paths, and virtual
URIs. Desktop and Web extension-host checks exercise real definition providers,
cross-file aliases, unsaved target edits, qualifier creation/deletion, and
cyclic aliases.

## Reference semantics

The Android documentation defines the hexadecimal forms and XML name-based
references in [color resources](https://developer.android.com/guide/topics/resources/more-resources#Color).
The [resource overview](https://developer.android.com/guide/topics/resources/providing-resources)
describes qualified alternatives and aliases. The restrictions above are this
extension's static-analysis choices, not a complete Android resource merger.
