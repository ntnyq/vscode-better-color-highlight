# Color Format Roadmap Research

Date: 2026-08-12

## Scope

This note compares the extension's current detector model with official color
specifications and platform APIs. It is research input for a future roadmap,
not a committed product plan.

The repository already supports the principal CSS Color 4 functions, Tailwind
CSS v3/v4 theme colors, DTCG JSON/YAML tokens, Flutter/Dart colors, Hyprland,
and ANSI SGR colors. The strongest remaining opportunities are therefore
standards-compliance gaps, nested static color expressions, and
language-scoped formats whose channel semantics differ from CSS.

## Recommended Priorities

| Priority | Format or ecosystem                                      | Static examples                                                                | Value                                                                                              | Main risk                                                                                               |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| P0       | Context-aware packed hexadecimal colors                  | Android `#AARRGGBB`, Compose `Color(0xAARRGGBB)`                               | Prevents incorrect RGBA interpretation and creates a base for more native-language detectors       | The same spelling has different byte order across ecosystems                                            |
| P0       | CSS Color 4 conformance completion                       | `rgb(none 0 0)`, `color(display-p3-linear 1 0 0)`                              | Completes the extension's core standards story with bounded work                                   | Missing components must be retained for interpolation but render as zero outside it                     |
| P0       | CSS `color-mix()` for statically resolvable operands     | `color-mix(in oklch, #f00 40%, #00f)`                                          | High-value modern CSS/design-system syntax and a natural fit with existing CSS variable resolution | Correct interpolation is color-space, hue, percentage, and alpha aware; it is not an RGB average        |
| P1       | Android XML, Jetpack Compose, and framework `Color` APIs | `#ARGB`, `Color(red, green, blue, alpha)`, `Color.hsl(...)`, `Color.argb(...)` | Large, coherent ecosystem with official, statically parseable forms                                | Kotlin/Java overloads, numeric suffixes, comments, and resource indirection require structural scanning |
| P1       | Static relative CSS colors and `alpha()`                 | `oklch(from var(--brand) l calc(c * .9) h)`, `alpha(from red / .5)`            | Builds on `color-mix()` parsing and the existing custom-property resolver                          | Nested `var()`/`calc()`, channel units, and origin-space conversion require a real expression parser    |
| P2       | SwiftUI/UIKit constants                                  | `Color(red: 1, green: 0, blue: 0)`, `UIColor(red:green:blue:alpha:)`           | Common static native UI syntax with clear numeric semantics                                        | System and asset-catalog colors are environment-dependent and must not be guessed                       |
| P2       | Unity C# constants                                       | `new Color(1f, 0f, 0f, .5f)`, `new Color32(255, 0, 0, 128)`                    | Two well-defined static constructors cover normalized and byte channels                            | Generic C# constructors and vectors must not be mistaken for colors                                     |

## Primary-Source Findings

### CSS Color 4 and 5

CSS Color 4 permits `none` in modern color functions. Outside interpolation, a
missing component behaves as zero; during interpolation it carries missingness
semantics. The current extension's numeric regular expressions do not accept
this keyword. The current CSS Color 4 specification also lists
`display-p3-linear` among predefined spaces, which the extension does not yet
parse or convert.

Sources:

- [CSS Color 4: modern and legacy syntax](https://www.w3.org/TR/css-color-4/#color-syntax)
- [CSS Color 4: missing components and `none`](https://www.w3.org/TR/css-color-4/#missing)
- [CSS Color 4: predefined `color()` spaces](https://www.w3.org/TR/css-color-4/#predefined)

CSS Color 5 adds `color-mix()`, relative color syntax, `alpha()`,
`light-dark()`, `contrast-color()`, `device-cmyk()`, and custom color profiles.
`color-mix()` specifies interpolation-space selection, percentage
normalization, hue interpolation, and alpha handling. Relative colors convert
an origin into the target processing space and can refer to or calculate from
its channels.

Sources:

- [CSS Color 5: `color-mix()`](https://www.w3.org/TR/css-color-5/#color-mix)
- [CSS Color 5: relative colors](https://www.w3.org/TR/css-color-5/#relative-colors)
- [CSS Color 5: relative alpha colors](https://www.w3.org/TR/css-color-5/#relative-alpha-colors)

The Color 5 work remains a draft. Static, deterministic subsets should be
implemented first and backed by Web Platform Tests or equivalent fixtures.

### Android and Jetpack Compose

Android XML color resources use `#RGB`, `#ARGB`, `#RRGGBB`, and `#AARRGGBB`.
The alpha-first four- and eight-digit forms conflict with CSS's alpha-last
forms, so a single workspace-wide RGBA/ARGB switch is not sufficient for safe
automatic highlighting.

Jetpack Compose defines `Color(Long)` from a 32-bit ARGB integer, integer and
floating-point component overloads, HSL/HSV factories, and named companion
colors. The Android framework separately defines ARGB color ints and
`rgb(...)`, `argb(...)`, and `parseColor(...)` APIs.

Sources:

- [Android XML color resources](https://developer.android.com/guide/topics/resources/more-resources#Color)
- [Jetpack Compose color constructors](<https://developer.android.com/reference/kotlin/androidx/compose/ui/graphics/package-summary#Color(kotlin.Long)>)
- [Jetpack Compose `Color`](https://developer.android.com/reference/kotlin/androidx/compose/ui/graphics/Color)
- [Android framework `Color`](https://developer.android.com/reference/android/graphics/Color)

### SwiftUI and UIKit

SwiftUI exposes constant RGB, hue/saturation/brightness, and grayscale
initializers. Its documentation explicitly distinguishes constant component
colors from system and asset-catalog colors that resolve in an environment.
UIKit exposes a static `UIColor(red:green:blue:alpha:)` initializer.

Sources:

- [SwiftUI `Color`](https://developer.apple.com/documentation/swiftui/color)
- [SwiftUI RGB initializer](<https://developer.apple.com/documentation/swiftui/color/init(_:red:green:blue:opacity:)>)
- [UIKit RGB initializer](<https://developer.apple.com/documentation/uikit/uicolor/init(red:green:blue:alpha:)>)

### Unity

Unity's `Color` uses floating-point RGBA components, normally in the 0-1
range. `Color32` represents byte components. Both are suitable for
language-scoped, static-only parsing.

Sources:

- [Unity `Color`](https://docs.unity3d.com/6000.1/Documentation/ScriptReference/Color.html)
- [Unity `Color32`](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Color32.html)

## Architecture Implications

1. Replace further regex growth with a balanced-parenthesis tokenizer and a
   small color-expression AST. `color-mix()`, relative colors, `calc()`, and
   nested `var()` cannot be made robust with one flat regular expression.
2. Add source-syntax and presentation metadata to `ColorMatch`. The current
   `generic | read-only` edit mode and Dart-only presentation branch will not
   scale to Android, Swift, and Unity replacements.
3. Add overlap arbitration. A complete `color-mix(...)` match otherwise
   overlaps the inner HEX/function matches produced by existing detectors.
4. Resolve packed HEX order from a precise language/file/syntax context, while
   preserving the current global option as a compatibility override.
5. Preserve higher-precision/color-space data internally until display. The
   current 8-bit sRGB string is adequate for decorations but loses information
   needed by wide-gamut interpolation and source-preserving edits.

## Explicit Deferrals

- `light-dark()` and platform semantic colors: the result depends on theme,
  color scheme, state, or environment and has no single static value.
- `contrast-color()`: the current draft leaves important behavior to the user
  agent and it should not be presented as a deterministic source color yet.
- `device-cmyk()` and custom `@color-profile`: accurate output can require
  device/ICC context and external profile loading.
- Generic GLSL/HLSL vectors, arrays, and tuples: `vec3(...)`, `(r, g, b)`, and
  `[r, g, b]` are overwhelmingly ambiguous without semantic type information.
- Arbitrary JavaScript configuration execution: it would conflict with the
  extension's current trust, Web-extension, and no-project-code-execution
  boundaries.

## Suggested Delivery Order

1. Engine contract: source syntax, presentation adapters, overlap policy, and
   context-aware packed HEX behavior.
2. CSS Color 4 completion plus static `color-mix()`.
3. Android XML, Compose, and framework constructors; then local resource
   navigation as a separate bounded feature.
4. Static relative CSS colors and `alpha()`.
5. SwiftUI/UIKit and Unity detectors, selected or reordered according to user
   demand.
