# Static stepped CSS math and computed mix weights

Date: 2026-10-25. Status: implemented for v0.9.0 preparation.

## Behavior

The existing typed, bounded evaluator now accepts `round()`, `mod()`, and
`rem()` in absolute/relative channels, alpha, and `color-mix()` weights.
Functions nest with `calc()`, `min()`, `max()`, and `clamp()`. Arguments can
contain arithmetic directly. Numbers, percentages, and compatible angles retain
their types; angles normalize to degrees. Relative channel names are numbers.

`round()` supports nearest, up, down, and to-zero strategies. Nearest ties go
toward positive infinity. A missing step defaults to 1 only for number values;
typed values require a matching explicit step. Negative steps describe the
same multiple grid as positive steps. Exact multiples retain their value,
including signed zero. `mod()` results follow the divisor's sign; `rem()`
results follow the dividend's sign, including zero.

Mix items split on whitespace outside balanced parentheses, so nested math
commas and whitespace stay within one weight. A percentage may precede or
follow its color. Calculated percentages clamp at the final 0–100% boundary;
out-of-range literals are invalid. Existing weight distribution, normalization,
premultiplied alpha, and transparent-zero-total behavior are preserved.

## Boundaries and editing

The evaluator retains its shared limits: 4,096 characters, 256 tokens, and
32 nested levels per component. Zero steps, invalid arity, unknown rounding
strategies, inconsistent units, and non-finite values/intermediate results are
rejected. A round quotient or result that overflows is also rejected. The
implementation never executes input as JavaScript.

Variable expansion uses the existing deterministic CSS custom-property
resolver and its trust, ambiguity, freshness, and resource limits. Picker and
alpha actions replace the complete outer expression with a static color.
Unsupported outer expressions may still expose detectable inner colors.

General dimensional algebra, other math functions/constants, length-based
`line-width` rounding, runtime values, and dynamic cascade inference remain
outside this finite color subset.

## Verification and primary sources

Evaluator tests cover signs, ties, rounding modes, units, signed zero,
composition, malformed input, and resource limits. Parser and variable tests
cover computed weights, bounds, alpha, and original source ranges. Playground
snapshots and document-color provider tests verify complete matches and edits.
The shared desktop/Web/installed-VSIX checks exercise stepped math and variable
weights; desktop/Web editing fixtures exercise picker and real hover actions.
Benchmarks cover normal, malformed, unclosed, and external-variable resolution.

- [CSS Values 4 stepped functions](https://drafts.csswg.org/css-values-4/#round-func)
- [CSS Values 4 numeric-function range checking](https://drafts.csswg.org/css-values-4/#numeric-functions)
- [CSS Color 5 mixing](https://drafts.csswg.org/css-color-5/#color-mix)
