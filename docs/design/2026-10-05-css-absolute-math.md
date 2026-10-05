# Static math in absolute CSS colors

Date: 2026-10-05. Delivery stage: P5.

## Supported behavior

Absolute `rgb()`/`rgba()`, `hsl()`/`hsla()`, `hwb()`, `lab()`/`lch()`,
`oklab()`/`oklch()`, and supported `color()` spaces accept finite static
`calc()`, `min()`, `max()`, and `clamp()` expressions in channels and alpha.
The functions reuse the [P4 evaluator](2026-10-05-css-comparison-math.md),
including nested arithmetic, compatible angle units, and `none` clamp bounds.

```css
rgb(min(255, 128) 0 0 / calc(1 / 2))
hsl(calc(60 + 60), min(100%, 80%), 50%)
oklch(clamp(.2, .65, .8) .2 30)
color(srgb max(.2, .5) 0 0 / min(1, .75))
color-mix(in srgb, rgb(max(128, 64) 0 0), blue)
```

Parameter splitting respects parentheses: nested commas, whitespace, and
division do not select legacy syntax, split a channel, or introduce alpha.
Only top-level commas select legacy RGB/HSL syntax. Modern functions still
require exactly three channels and at most one slash-delimited alpha.

## Types and evaluation boundaries

Each math result retains its number, percentage, or angle type until the
color channel applies its scale:

| Channel                                             | Accepted result      | Value represented by 100% |
| --------------------------------------------------- | -------------------- | ------------------------- |
| RGB channel                                         | number or percentage | 255                       |
| Hue                                                 | number or angle      | Percentages are invalid   |
| Modern HSL saturation/lightness and HWB white/black | number or percentage | 100                       |
| Lab/LCH lightness                                   | number or percentage | 100                       |
| OKLab/OKLCH lightness                               | number or percentage | 1                         |
| Lab a/b                                             | number or percentage | 125                       |
| LCH chroma                                          | number or percentage | 150                       |
| OKLab a/b and OKLCH chroma                          | number or percentage | 0.4                       |
| `color()` channels and alpha                        | number or percentage | 1                         |

Legacy RGB requires all three channel results to have the same type (number
or percentage). Legacy HSL saturation and lightness require percentage
results. Legacy color components cannot be `none`; a `none` bound within
`clamp()` still produces an ordinary numeric result. Modern `none` components
retain missing-value semantics, including interpolation behavior.

Absolute RGB channels clamp to 0–255 (or 0–100%) before composition. Alpha
clamps to 0–1, Lab-family lightness to its reference range, and polar chroma
and HSL saturation to a minimum of zero. Hue normalizes to degrees in
[0, 360). These rules apply consistently to literals and computed values.
HWB white/black values above a combined 100% normalize by their ratio, so
`hwb(0 calc(200%) calc(100%))` previews as two-thirds gray.
`color()` retains out-of-gamut channel values, and relative outputs keep their
extended components. HSL conversion likewise retains saturation above 100%
and extended lightness until preview, so a calculation is not prematurely
clipped before composition.

The absolute parser supplies no relative channel identifiers. Unknown names,
runtime values, empty/extra arguments, incompatible units, division by zero,
non-finite values, and unsupported calculations reject the expression. A
number and a percentage cannot be added or compared even when both types are
individually accepted by that channel. The evaluator retains the supported
multiplication/division subset and binary `+`/`-` whitespace requirements.
The final sRGB preview must also remain finite: extremely large finite Lab or
wide-gamut inputs that overflow color-space conversion are skipped.

Each math component retains the 4,096-character, 256-token, and 32-level limits.
The independent color-expression and custom-property expansion limits remain
in force. Scanning continues after rejected expressions and unclosed starts;
independently resolvable nested colors can still be highlighted.

## Composition and editing

Absolute math colors can serve as `color-mix()` operands and relative-color
origins. Deterministic custom properties can supply channels and operands,
using the existing ambiguity rules, trust gates, and opt-in cross-file lookup.
Resolved matches retain the complete original source range, including `var()`.
Picker presentations and alpha commands replace that range with a static
color; they do not rewrite individual calculations or variable declarations.

No strategy, configuration option, or dependency is added. Parsing remains
static and never executes source text.

## Verification and references

Regression coverage includes modern and legacy syntax, all channel scales,
missing values, nested separators, invalid types, finite arithmetic, resource
limits, recovery, variable substitution, interpolation, and editor edits.
Playground snapshots and desktop/Web smoke tests exercise complete ranges and
stale-command rejection. Benchmarks include normal calculations, rejected
limits, unclosed math starts, and excessive top-level arguments; results are
recorded in [the performance baseline](../performance-baseline.md).

Syntax and type expectations were checked against primary sources and the
applicable finite subset of Web Platform Tests:

- [CSS Color 4 color syntax](https://www.w3.org/TR/css-color-4/#color-syntax)
- [CSS Values 4 percentage/dimension combinations](https://www.w3.org/TR/css-values-4/#mixed-percentages)
- [CSS Values 4 comparison functions](https://www.w3.org/TR/css-values-4/#comp-func)
- [WPT RGB parsing cases](https://github.com/web-platform-tests/wpt/blob/master/css/css-color/parsing/color-valid-rgb.html)
- [WPT HSL parsing cases](https://github.com/web-platform-tests/wpt/blob/master/css/css-color/parsing/color-valid-hsl.html)
- [WPT computed Lab cases](https://github.com/web-platform-tests/wpt/blob/master/css/css-color/parsing/color-computed-lab.html)
- [WPT color() parsing cases](https://github.com/web-platform-tests/wpt/blob/master/css/css-color/parsing/color-valid-color-function.html)

## Deferred scope

`round()`, `mod()`, `rem()`, other math functions/constants, general CSS unit
algebra, runtime-dependent expressions, and math in `color-mix()` weights
remain outside P5. This bounded highlighting support does not claim complete
CSS evaluation or browser compatibility for every syntax form.
