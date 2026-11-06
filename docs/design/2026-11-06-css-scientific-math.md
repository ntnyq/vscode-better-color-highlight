# Static CSS trigonometric and exponential math

Date: 2026-11-06. Status: implemented, unreleased.

## Behavior

The typed color evaluator now handles `sin`, `cos`, `tan`, `asin`, `acos`,
`atan`, `atan2`, `pow`, `sqrt`, `hypot`, `log`, and `exp`, plus the `pi` and `e`
calculation keywords. Functions share the existing arithmetic grammar and can
nest in absolute/relative color channels, alpha, and calculated mix weights.

Trigonometric inputs are numbers in radians or angles. Inverse trigonometric
functions take numbers and produce angles in canonical degrees. `atan2(y, x)`
requires two inputs of the same type; signed zero retains the specified angle
endpoints. `hypot` preserves a common number, percentage, or angle type.
Powers, roots, logarithms, and exponentials require numbers. `log` defaults to
base e; explicit bases must be positive and unequal to 1. Constants are valid
only inside calculations, including for relative colors.

```css
rgb(calc(sin(pi / 2) * 128) pow(2, 6) sqrt(256) / exp(log(.5)))
hsl(from red calc(h * 1deg + acos(-1)) s l)
color-mix(in srgb, red hypot(30%, 40%), blue)
```

## Evaluation and editing boundaries

Every source operand and evaluated subexpression must remain finite. Invalid
domains such as `sqrt(-1)` or `log(0)`, overflow such as `exp(1000)`, and
incompatible units fail before outer operations can conceal them. Stable
`Math.hypot` evaluation avoids overflowing the squares of otherwise valid
finite inputs. Signed zero is preserved where defined; `log(1, .5)` returns
positive zero.

Angles convert to degrees using the existing finite conversion rules, then
reduce modulo one turn before forward trigonometric evaluation. Number inputs
remain radians. Exactly represented tangent poles are rejected because they
have no portable finite result. Nearby finite inputs remain valid without an
epsilon cutoff. Exact quadrant results are resolved in the input unit before
conversion, preventing residuals from turning into non-zero `sign()` results.
Other trigonometric results use normal floating-point precision. Non-finite
constants, dimensional division, and layout-dependent units remain outside
this evaluator's supported subset.

The 4,096-character, 256-token, and 32-level limits are unchanged and shared by
all function families. The tokenizer recognizes `atan2` as one identifier and
still rejects malformed suffixes and whitespace between names and parentheses.
Unclosed or excessive expressions cannot consume subsequent complete colors.
The named-color detector skips `tan(` function names even inside rejected or
unfinished expressions; standalone `tan` color values still match.
Optional bare RGB/HSL detection excludes operands inside math functions,
including invalid calls, without consuming later declarations. Its incremental
context scan uses linear time and constant memory. Literal signs do not consume
nesting depth, so signed numbers still work at the 32-level boundary.

Custom-property substitution retains existing scope, trust, and freshness
rules. Result types still have to match their destination: inverse trig cannot
be used directly as an RGB channel, and mix weights must remain percentages.
Full source ranges are retained for highlighting, native picker replacement,
and hover alpha edits. Edits materialize a static color.

## Verification and sources

Evaluator and parser regressions cover domains, units, arity, constants, signed
zero, extreme finite values, shared resource limits, and scan recovery.
Variable/provider tests and playground snapshots cover complete expressions.
Shared host smoke coverage exercises accepted and rejected math in desktop,
Web, and installed VSIX runtimes. Editing fixtures exercise picker and hover
alpha actions with LF and CRLF. Benchmarks cover normal, excessive, and
unclosed expressions without timing gates.

- [CSS Values 4 trigonometric functions](https://drafts.csswg.org/css-values-4/#trig-funcs)
- [CSS Values 4 exponential functions](https://drafts.csswg.org/css-values-4/#exponent-funcs)
- [CSS Values 4 numeric constants](https://drafts.csswg.org/css-values-4/#calc-constants)
- [Web Platform Tests: exponential/logarithm computation](https://github.com/web-platform-tests/wpt/blob/master/css/css-values/exp-log-compute.html)
