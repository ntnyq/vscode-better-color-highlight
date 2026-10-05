# Static CSS comparison math

Date: 2026-10-05. Delivery stage: P4.

## Supported behavior

Relative CSS colors and `alpha()` accept `min()`, `max()`, and `clamp()` in
channel and alpha positions. They share the bounded evaluator used by
`calc()`, and all four functions can nest in either direction. Comparison
arguments are complete arithmetic expressions, so an extra `calc()` wrapper
is optional inside them.

```css
oklch(from var(--brand) clamp(.2, l, .8) min(c * .9, .2) h)
rgb(from red calc(max(r, 20) / 2) g b)
alpha(from red / min(alpha, .5))
alpha(from red / clamp(none, alpha * .5, .8))
```

The implementation follows the finite static subset of
[CSS Values 4 comparison functions](https://www.w3.org/TR/css-values-4/#comp-func):

- `min()` and `max()` require at least one argument.
- `clamp(MIN, VAL, MAX)` requires exactly three arguments and evaluates as
  `max(MIN, min(VAL, MAX))`, so the minimum wins if bounds conflict.
- The first or third `clamp()` argument may be `none` to remove that bound.
  This is independent of a color component's missing-value `none` semantics.
- Every numeric argument must have the same type: number, percentage, or
  angle. Compatible angle units normalize to degrees before comparison.
- Relative channel identifiers are numbers in the target color space's
  channel scale. For example, `min(alpha, .5)` is valid, while mixing `alpha`
  with `50%` is not supported.

## Evaluation boundaries

The evaluator validates every argument, including those not selected by a
comparison. Invalid syntax, empty arguments, incompatible units, division by
zero, and non-finite literals or intermediate results reject the component.
It retains the existing multiplication/division subset and whitespace rules
for binary addition/subtraction. It never executes source code.

Each math component has the existing 4,096-character, 256-token, and 32-level
recursion limits. The color parser and deterministic custom-property resolver
retain their independent limits and ambiguity rules. A rejected expression
does not prevent detection of later valid colors; statically resolvable inner
colors may still be highlighted.

The evaluator's `evaluateColorCalc` API and typed result remain stable. The
relative parser already preserves nested parentheses and delegates each
component to it, so no new registry entry or configuration is required.

## Editing and verification

Resolved expressions retain their complete original source ranges, including
custom-property references. Existing picker and alpha commands replace the
whole expression with a static color presentation; they do not rewrite its
individual calculations or declarations.

Coverage includes evaluator syntax and limits, relative spaces and missing
channels, custom-property substitution, expression overlap/ranges, provider
presentations and commands, playground snapshots, and desktop/Web smoke
tests. Performance fixtures cover normal nested calculations, rejected
character/token/depth limits, and unclosed math function starts. Full tests
and isolated VSIX installation validate the delivered extension.

## Deferred scope

Math expressions inside absolute colors were deferred from P4 and are now
covered by [P5](2026-10-05-css-absolute-math.md). `round()`, `mod()`, `rem()`,
other math functions/constants, general CSS unit algebra, and runtime-dependent
values remain outside these stages. No browser-support claim is implied by
static highlighting, particularly for the draft `alpha()` color syntax.
