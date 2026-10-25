# Static CSS sign-related math

Date: 2026-10-25. Status: implemented, unreleased.

## Behavior

The existing typed evaluator accepts `abs()` and `sign()` anywhere it already
accepts static math: absolute and relative color channels, alpha, and calculated
`color-mix()` weights. Each function accepts exactly one calculation, which may
contain arithmetic or nest any supported math function.

`abs()` returns a non-negative value with the argument's number, percentage,
or angle type. It converts negative zero to positive zero. `sign()` returns
the number -1, +1, positive zero, or negative zero, preserving an input zero's
sign. Angle literals first convert to degrees; sign is determined before any
outer hue normalization. Relative channel identifiers remain numbers.

Color-channel and mix-percentage reference ranges are positive constants in
this subset, so percentage signs are deterministic. This does not provide a
general layout-dependent CSS evaluator. For example, `sign(-25%)` produces
the number -1, not -1%; a mix weight must still resolve to a percentage:

```css
rgb(abs(-128) calc(sign(-10%) * -64) 0 / abs(-.5))
rgb(from red abs(r - 127) calc(sign(-10%) * -64) b)
alpha(from red / abs(alpha - 1.75))
color-mix(in srgb, red abs(-25%), blue calc(sign(1deg) * 75%))
```

## Boundaries and editing

All operands and intermediate values must remain finite, including before a
sign operation. `sign(1e308 * 2)` is rejected rather than allowing the sign of
infinity to conceal overflow. Invalid arity, unsupported units/constants,
unresolved variables, and incompatible sums/products remain invalid. No source
code is executed.

The existing 4,096-character, 256-token, and 32-level limits are shared across
all math families. Arithmetic and angle conversion retain finite floating-point
precision. The existing stepped-math decimal rounding policy is unchanged.
`sign()` returning a number does not bypass the destination's type rules:
legacy RGB cannot mix number and percentage channels, legacy HSL saturation
and lightness require percentages, and mix weights require percentages.
Calculated mix weights clamp only after complete evaluation.

Deterministic custom-property substitution, aliases, trust gates, and source
freshness checks use the existing resolver. Whole outer-expression ranges are
retained through highlighting, native picker presentations, and hover alpha
actions. Edits materialize a static color. Unsupported outer expressions may
still expose independently detectable inner colors.

## Verification and sources

Evaluator regressions cover numbers, percentages, angles, signed zero, extreme
finite values, non-finite operands, arithmetic composition, invalid syntax,
and exact resource bounds. Parser, variable, and provider tests cover result
types, complete source ranges, and replacements. Playground snapshots show
accepted expressions and malformed-input recovery.

Shared desktop/Web/installed-VSIX smoke tests exercise variables, nested sign
functions, result types, and overflow rejection. Desktop/Web editing fixtures
cover absolute, relative, alpha, and mix-weight expressions with both LF and
CRLF, including picker edits and stale real-hover commands. Benchmarks record
normal, over-limit, and unclosed sign-expression scanning separately.

- [CSS Values 4 sign-related functions](https://drafts.csswg.org/css-values-4/#sign-funcs)
- [CSS Values 4 calculation type checking](https://drafts.csswg.org/css-values-4/#calc-type-checking)
- [CSS Color 5 mixing](https://drafts.csswg.org/css-color-5/#color-mix)
