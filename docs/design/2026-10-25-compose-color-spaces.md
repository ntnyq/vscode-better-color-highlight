# Compose explicit static color spaces

Completed: 2026-10-25. This extends the existing Kotlin native-color adapter;
the source kind remains `android-color` and the entire call is editable.

## Evidence and scope

The existing `playground/android.kt` contained an explicitly skipped
`Color(1f, 0f, 0f, colorSpace = ColorSpaces.DisplayP3)` example. AndroidX exposes
an optional fifth color-space argument on the float constructor and on both
HSL/HSV factories. The integer constructor has no such argument. HSL/HSV
factories calculate RGB components and pass those components to the constructor
in the requested RGB space. Treating those components as sRGB would give the
wrong preview, especially for linear-light middle gray.

This first subset supports three spaces already covered by the shared
high-precision converter:

| Compose property         | Conversion space | Source RGB range |
| ------------------------ | ---------------- | ---------------- |
| `ColorSpaces.Srgb`       | `srgb`           | `[0, 1]`         |
| `ColorSpaces.LinearSrgb` | `srgb-linear`    | `[0, 1]`         |
| `ColorSpaces.DisplayP3`  | `display-p3`     | `[0, 1]`         |

Both short properties and the complete
`androidx.compose.ui.graphics.colorspace.ColorSpaces` qualifier are accepted.
`Color`, `Color.hsl`, and `Color.hsv` may themselves use the existing complete
`androidx.compose.ui.graphics` qualifier. Detection remains textual and Kotlin
only; it does not infer imports or resolve symbols shadowing those names.

Use literal float arguments with `f`/`F` suffixes for every numeric argument.
The fifth positional argument requires an explicit fourth alpha argument.
Named `colorSpace` may omit alpha or appear in any supported named-argument
order. Named arguments cannot be followed by positional arguments, consistent
with the existing conservative binder. Unknown/duplicate arguments, mixed
numeric overloads, out-of-range/non-finite numbers, expressions and calls are
rejected. Alpha is `[0, 1]`; hue is `[0, 360]`; saturation/lightness/value are
`[0, 1]`. Existing 4,096-character bounds apply to the complete call.

Other predefined spaces remain unsupported. Extended RGB and HDR require
different source ranges or transfer functions; Lab/XYZ are not RGB spaces and
cannot share the HSL/HSV edit contract. Adobe RGB, BT.2020, DCI-P3 and ProPhoto
are also deferred until their Compose definitions and editing semantics are
validated. Custom RGB objects, aliases and dynamic spaces are not evaluated.

## Preview and source editing

RGB literals convert from their declared space to sRGB. For HSL/HSV, derive
native RGB channels first, then interpret those channels in the declared space
before conversion. Clipping and byte rounding occur at the existing preview
boundary, not in intermediate color conversions.

The VS Code picker supplies sRGB channels. Convert them into the original
space, clamp matrix noise into the supported `[0, 1]` range, and write RGB or
derive HSL/HSV from those native RGB channels. Preserve constructor/factory,
space argument and qualification, argument order/labels, comments, whitespace,
existing numeric suffixes, and trailing commas. Retain an explicit alpha even
at one; append omitted alpha only when transparency is needed. Append named
`alpha = ...` when the call contains named arguments, allowing insertion after
a named `colorSpace` without accidentally binding a fifth positional float.

Kotlin scanning and argument masking share nested block-comment boundaries.
Parameters and closing parentheses within any comment level cannot create a
match or change its range. Java retains non-nested block-comment semantics.
Picker formatting passes the document language through the source adapter;
alpha commands use the active document's language before the existing URI/text
freshness check. Re-parsing or validating a replacement uses that same language,
including Kotlin calls to Android framework factories.
Generated Android/Compose replacements are checked against the same literal
call bounds before they are returned. If inserting alpha or expanding numeric
tokens would exceed 4,096 characters, the picker offers no edit and alpha
commands leave the source unchanged. Comments and whitespace are not removed
to fit the limit.

Changing alpha must not convert a clipped sRGB preview back to the source
space: that would destroy wide-gamut colors. `NativeColor.formatAlpha` is an
optional adapter hook used by the existing alpha command. This adapter edits
only the alpha argument, or inserts it when missing, leaving every original
color-component token unchanged. Other native adapters retain their existing
behavior.

Previews are sRGB approximations. For explicit spaces, picker callbacks whose
RGB channels equal the current clipped/rounded preview change only alpha.
Matching alpha as well returns the original source unchanged, including source
alpha precision beyond the preview's three decimals. Channel comparison allows
only normalization round-trip floating-point noise, not byte-wide or perceptual
tolerances. Alpha commands at a clamped endpoint also preserve the original
text. A distinct RGB selection replaces the original color with the selected
sRGB color represented in its original space. Picker
serialization uses the existing six-decimal formatter and shared floating-point
converter; matrix noise and display rounding may affect the last decimal.
Compose runtime FP16 RGB, 8/10-bit alpha storage and device rendering intents
are not emulated. Alpha edits preserve source precision within this contract.

## Verification

Unit tests cover linear gray, non-primary Display P3 channels, HSL/HSV space
semantics, qualification, named/positional overloads, language boundaries,
unsupported spaces, invalid arguments, bounded recovery, picker round trips,
and exact component-text preservation during alpha changes. Playground
snapshots exercise registry arbitration and complete ranges. Provider tests
verify source presentations. Desktop and Web fixtures cover actual picker and
hover-alpha commands, wide-gamut source preservation, LF/CRLF, UTF-16 ranges,
stale/repeated command rejection, and no edits outside the call.
Review regressions also cover 9,000 cube/near-neutral picker round trips,
preview identity and fractional RGB edits, nested-comment decoys, exact-limit
replacements, and rejected output growth.

## Sources

- [AndroidX Color constructors and HSL/HSV factories](https://github.com/androidx/androidx/blob/androidx-main/compose/ui/ui-graphics/src/commonMain/kotlin/androidx/compose/ui/graphics/Color.kt)
- [AndroidX predefined color-space definitions](https://github.com/androidx/androidx/blob/androidx-main/compose/ui/ui-graphics/src/commonMain/kotlin/androidx/compose/ui/graphics/colorspace/ColorSpaces.kt)
- [Kotlin nested block comments](https://kotlinlang.org/docs/basic-syntax.html#comments)
