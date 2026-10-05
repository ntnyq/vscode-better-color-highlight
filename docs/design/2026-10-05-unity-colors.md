# Unity C# static colors

Status: implemented for the release after v0.8.0.

## Supported expressions

C# documents recognize complete `new UnityEngine.Color(r, g, b[, a])` and
`new UnityEngine.Color32(r, g, b, a)` expressions. The optional
`global::UnityEngine` qualifier is retained in source edits. Matching is case
sensitive and restricted to the `csharp` language ID.

`Color` components are limited to 0–1 and omitted alpha resolves to 1.
Accepted numbers are decimal integer literals or decimal/scientific float
literals ending in `f` or `F`. `Color32` requires four decimal integer
components in 0–255, including alpha. Contiguous leading signs are accepted
when the resulting number remains in range. Internal decimal digit separators
are accepted in integer, fractional, and exponent digits, including repeated
underscores where C# permits them. Hexadecimal or binary channel literals,
casts, calculations, variables, nonfinite values, and double/decimal literals
are outside this subset.

Arguments may be positional or use `r:`, `g:`, `b:`, and `a:` labels. Named
arguments may be reordered. A named argument before a later positional
argument must occupy its declaration position, following C# argument rules.
Duplicate or unknown labels, missing required components, extra arguments,
trailing commas, malformed comments, and unterminated calls reject the match.
Whitespace and comments inside arguments are supported; comments between
`new` and the qualified type name are outside the supported spelling.

## Identity and preview boundaries

Explicit Unity qualification avoids treating unrelated `Color`, `Color32`,
vectors, and generic C# constructors as Unity colors. Bare names are skipped
even when `using UnityEngine` appears in the same file: local types, aliases,
and other namespaces cannot be disambiguated without a C# semantic model.
Target-typed `new(...)`, namespace aliases, and escaped identifiers are also
outside this delivery.

The preview treats normalized or byte channels as a static display color.
It does not infer a Unity project's gamma/linear rendering configuration,
execute code, or evaluate HDR lighting, material effects, color conversions,
presets, runtime values, or system colors. Restricting `Color` channels to
0–1 is this extension's preview boundary, not a claim that Unity cannot store
HDR components.

## Editing and integration

Each recognized constructor owns its complete source range, including `new`
and the closing parenthesis. It uses the native presentation adapter for
picker replacements and alpha adjustment. Edits retain qualification,
argument order, labels, comments, whitespace, and existing `f`/`F` case where
possible. Fractional replacements of integer `Color` channels gain a float
suffix so the replacement remains a valid C# float argument. Adding alpha to
the three-channel overload adds one argument; `Color32` always retains its
four-channel byte form.

The language-scoped strategy shares the native constructor scanner and its
4,096-character expression bound. Unity stops an invalid candidate at an
unquoted, uncommented nested opening parenthesis, then resumes detection at
later constructor starts. This avoids repeated long scans of unfinished
expressions. Other native strategies retain nested scanning by default.
No filesystem reads, project execution,
new configuration, or workspace-trust grant is needed. Existing generic
detectors retain their independent behavior outside supported constructors.

Regression coverage includes language boundaries, qualified and global names,
float/byte semantics, named-argument ordering, malformed and unsupported
syntax, source-preserving edits, exact ranges, provider integration, and
desktop/Web activation. The playground includes both supported and skipped
examples. Informational benchmarks measure 800 realistic constructors and
10,000 unterminated constructor starts; timings are not CI thresholds.

## Primary sources

Unity documents `Color`'s three- and four-float overloads, with the
three-channel overload supplying opaque alpha, in its
[`Color` constructor reference](https://docs.unity3d.com/ScriptReference/Color-ctor.html).
The [`Color32` constructor reference](https://docs.unity3d.com/ScriptReference/Color32-ctor.html)
defines four byte parameters.

Microsoft's [floating-point literal reference](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/floating-point-numeric-types#real-literals)
defines `f`/`F` as float suffixes and unsuffixed real literals as doubles.
Its [numeric conversion reference](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/numeric-conversions#implicit-numeric-conversions)
allows integral values to convert to float and in-range integer constants to
convert to byte. These rules determine which source tokens can safely be
accepted and emitted; the narrower static syntax above is an extension
design choice.

Microsoft's [named-argument rules](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/named-and-optional-arguments#named-arguments)
allow reordered names and constrain names followed by positional arguments.
