# Color detection performance baseline

The [latest complete run](#quality-follow-up-baseline-2026-10-25) covers all
40 fixtures after the v0.9.0 quality follow-up. Earlier measurements below are
historical.

## Initial baseline, 2026-10-02

Measured on 2026-10-02 with `pnpm bench`, Node 24.21.0, Vitest 5.0.3,
macOS arm64, Apple M1 Pro. Each latency is for a complete benchmark fixture,
not one color match. These local measurements are informational and are not CI
limits or a claim of improvement over a previous release.

| Fixture                                                   | Median (ms) | p99 (ms) |
| --------------------------------------------------------- | ----------: | -------: |
| 400 CSS rules, two literals per rule                      |       0.926 |    3.820 |
| 500 Tailwind markup elements                              |       8.652 |    9.463 |
| 10,000 Tailwind variants plus unmatched brackets          |       4.735 |    6.186 |
| 100 custom-property declarations and uses                 |       0.582 |    0.810 |
| 24 nested relative expressions around a color mix         |       2.309 |    2.624 |
| 10,000 unclosed relative color functions                  |       1.730 |    2.557 |
| 200-link variable chain, rejected at the resolution limit |       3.303 |    7.238 |
| 400 Compose and 400 Swift constructors, both detectors    |       2.533 |    2.888 |

`benchmarks/color-detection.bench.ts` defines the fixtures. Each run saves
machine-readable latency/throughput statistics under the ignored
`.benchmarks/` directory. Use the same machine and an otherwise idle system
when comparing runs; timings vary with scheduling and runtime warmup.

Parsing bounds are also covered by correctness tests, including malformed
native calls, cyclic/branching variables, nesting, and arithmetic token limits.

## Android resource parsing, 2026-10-05

Measured on the same macOS arm64 machine with Node 24.21.0, user-managed pnpm
12.9.1, and `pnpm bench -t "android resource"`. These fixtures measure the XML
parser only; they exclude filesystem I/O and definition-provider overhead.

| Fixture                                    | Median (ms) | p99 (ms) |
| ------------------------------------------ | ----------: | -------: |
| 500 color declarations and 500 aliases     |       0.722 |    0.912 |
| Unclosed tag with an 80,000-character name |       0.279 |    0.308 |

The earlier eight fixtures were not rerun during this stage. These measurements
are informational, with no timing thresholds in CI.

## Unity constructors, 2026-10-05

Measured on the same macOS arm64 machine with Node 24.21.0, user-managed pnpm
12.9.1, and `pnpm bench -t "Unity"`. These fixtures run the Unity detector
without VS Code provider, decoration, or filesystem overhead.

| Fixture                                  | Median (ms) | p99 (ms) |
| ---------------------------------------- | ----------: | -------: |
| 400 Color and 400 Color32 constructors   |       2.073 |    2.908 |
| 10,000 unclosed Unity constructor starts |       2.043 |    2.354 |

Unity's literal-only scanner stops at an unquoted, uncommented nested opening
parenthesis and continues finding later candidates. The same malformed fixture
measured 293.367 ms median before that change; both measurements were taken on
this machine during this stage. Other native detectors retain their existing
nested-call scanning. Earlier CSS, Android, and native baselines were not rerun.

## CSS comparison math, 2026-10-05

Measured on the same macOS arm64 machine with Node 24.21.0, user-managed pnpm
12.9.1, and `pnpm bench -t "CSS comparison math"`. These fixtures measure
`findColorFunctions`, including scanning and expression evaluation, without
VS Code provider, decoration, or filesystem overhead.

| Fixture                                                           | Median (ms) | p99 (ms) |
| ----------------------------------------------------------------- | ----------: | -------: |
| 400 rules, each with nested relative-color and alpha math         |       7.762 |   17.219 |
| 300 rejected expressions exceeding token, depth, or length limits |      12.602 |   15.813 |
| 10,000 unclosed `min()` starts followed by valid alpha math       |       1.579 |    2.454 |

The normal fixture contains 800 complete expressions using `min()`, `max()`,
`clamp()`, and `calc()`. The malformed fixture contains 100 examples of each
resource limit. Correctness tests separately verify rejection and recovery
of valid colors after malformed expressions. Earlier fixtures were not rerun;
these measurements are informational and do not impose CI timing thresholds.

## Absolute CSS math, 2026-10-05

Measured on the same macOS arm64 machine with Node 24.21.0, user-managed pnpm
12.9.1, and `pnpm bench -t 'absolute CSS math|direct CSS literals'`. These
fixtures measure the detector, including balanced scanning, evaluation, and
overlap arbitration, without VS Code provider or filesystem overhead.

| Fixture                                                                    | Median (ms) | p99 (ms) |
| -------------------------------------------------------------------------- | ----------: | -------: |
| 400 rules, each with modern RGB, legacy HSL, and a math color mix          |      12.942 |   21.240 |
| 300 rejected absolute expressions exceeding token, depth, or length limits |      11.857 |   17.351 |
| 10,000 unclosed `min()` starts followed by valid absolute math             |       1.575 |    2.813 |
| 10,000 space arguments plus 10,000 comma arguments, then valid math        |       1.235 |    1.704 |
| 400 CSS rules, two direct literals per rule                                |       1.214 |    2.475 |

The normal fixture contains 1,200 complete outer expressions and exercises
nested math in mix operands. The direct-literal fixture was rerun as a reference
for ordinary parsing. Earlier measurements remain historical; other fixtures
were not rerun in this stage. No timing thresholds are imposed in CI.

## Complete baseline, 2026-10-25

Measured with `pnpm bench`, Node 24.22.1, pnpm 12.15.0, Vitest 5.0.5,
macOS arm64, Apple M1 Pro. This run includes the review fixes for decimal
rounding and modulo boundaries. All 23 fixtures ran together after builds and
extension-host tests finished. Each latency covers the complete fixture;
benchmarks exclude provider/decorations and filesystem I/O. The external
CSS-variable fixture resolves 100 uses against declarations already loaded
from another source, measuring resolver work rather than file loading.

| Fixture                                                    | Median (ms) | p99 (ms) |
| ---------------------------------------------------------- | ----------: | -------: |
| 400 rules with stepped channels and calculated mix weights |       5.434 |    8.211 |
| 300 rejected stepped/weight expressions                    |       5.134 |    5.898 |
| 10,000 unclosed `round()` starts, then valid stepped math  |       2.297 |    2.783 |
| 100 external CSS custom-property resolutions               |       0.554 |    0.771 |
| 500 Android color declarations and 500 aliases             |       0.798 |    4.103 |
| Unclosed Android tag with an 80,000-character name         |       0.288 |    0.323 |
| 24 nested relative expressions around a color mix          |       2.178 |    2.499 |
| 10,000 unclosed relative color functions                   |       1.786 |    2.182 |
| 400 rules with relative comparison and alpha math          |       7.746 |    8.481 |
| 300 rejected comparison expressions at resource limits     |      12.069 |   14.768 |
| 10,000 unclosed `min()` starts, then valid alpha math      |       1.493 |    1.905 |
| 400 rules with modern RGB, legacy HSL, and math operands   |      12.475 |   13.530 |
| 300 rejected absolute expressions at resource limits       |      11.359 |   12.589 |
| 10,000 unclosed `min()` starts, then valid absolute math   |       1.546 |    2.275 |
| 10,000 space and 10,000 comma arguments, then valid math   |       1.131 |    1.350 |
| 200-link variable chain rejected at the resolution limit   |       3.139 |   10.913 |
| 400 Compose and 400 Swift constructors, both detectors     |       2.489 |    2.884 |
| 400 Unity Color and 400 Color32 constructors               |       1.932 |    2.304 |
| 10,000 unclosed Unity constructor starts                   |       1.951 |    2.145 |
| 400 CSS rules, two direct literals per rule                |       1.319 |    4.697 |
| 500 Tailwind markup elements                               |      10.145 |   23.707 |
| 10,000 Tailwind variants plus unmatched brackets           |       4.818 |    6.134 |
| 100 local CSS custom-property resolutions                  |       0.570 |    0.809 |

The stepped fixture contains 800 complete expressions. Its malformed fixture
contains 100 zero-step colors, 100 excessive weight calculations, and 100
over-depth stepped calculations. Parser tests separately verify rejection and
recovery; benchmark success alone is not a correctness assertion.

Raw statistics are written to the ignored `.benchmarks/` directory. Retain both
median and p99 statistics when comparing runs. These measurements
establish the current reference and do not demonstrate improvement against
older runs taken with different runtime/dependency versions. Benchmark timings
remain informational and do not impose CI timing thresholds.

## Quality follow-up baseline, 2026-10-25

Measured with `pnpm bench`, Node 24.22.1, pnpm 12.15.0, Vitest 5.0.5,
macOS arm64, Apple M1 Pro. All 40 fixtures passed in one run after the
stable/minimum desktop, Web, and installed-VSIX checks finished. This follow-up
adds 17 scanning fixtures and changes no runtime parser behavior. File stems
below identify the raw JSON statistics in `.benchmarks/`.

The shorthand, markup, and utility correctness tests retain malformed-input
rejection, recovery, and exact ranges. Their timing thresholds and sampling
helpers have moved out of unit tests. Paired 10,000/40,000-element fixtures
record scaling trends; they do not prove complexity or impose CI limits.
Allocation, garbage collection, and scheduler noise can affect both median and
p99, especially for large markup/selector fixtures. Compare repeated runs on
the same machine before drawing performance conclusions.

| Fixture                                     | Median (ms) | p99 (ms) |
| ------------------------------------------- | ----------: | -------: |
| `absolute-css-math-expressions`             |      12.534 |   13.336 |
| `android-resource-declarations-and-aliases` |       0.822 |    1.356 |
| `bounded-long-variable-chains`              |       3.274 |    3.718 |
| `bounded-malformed-absolute-css-math`       |      11.109 |   11.577 |
| `bounded-malformed-css-comparison-math`     |      12.091 |   12.558 |
| `bounded-malformed-stepped-css-math`        |       5.150 |    6.115 |
| `bounded-tailwind-candidate-scanning`       |       5.079 |    7.289 |
| `colon-and-bracket-heavy-non-utilities`     |       5.529 |    5.931 |
| `colon-heavy-non-utilities`                 |       2.164 |    3.271 |
| `css-comparison-math-expressions`           |       7.829 |    8.828 |
| `css-custom-property-resolution`            |       0.601 |    4.475 |
| `direct-css-literals`                       |       1.328 |    1.993 |
| `excess-absolute-css-math-arguments`        |       1.194 |    3.879 |
| `external-css-custom-property-resolution`   |       0.556 |    0.764 |
| `malformed-shorthand-0`                     |       0.196 |    0.250 |
| `malformed-shorthand-1`                     |       0.197 |    0.253 |
| `malformed-shorthand-2`                     |      46.586 |   59.970 |
| `malformed-shorthand-3`                     |       1.856 |    2.018 |
| `malformed-tags-10000`                      |       2.220 |    2.689 |
| `malformed-tags-40000`                      |      16.115 |   94.617 |
| `native-component-constructors`             |       2.650 |    5.423 |
| `nested-relative-colors-and-interpolation`  |       2.319 |    2.601 |
| `punctuation-heavy-selectors-10000`         |      74.652 |  163.916 |
| `punctuation-heavy-selectors-40000`         |     107.237 |  120.151 |
| `stepped-css-math-and-mix-weights`          |       5.222 |    5.851 |
| `tailwind-markup-decoys`                    |       9.279 |   12.742 |
| `tailwind-utilities`                        |       9.699 |   10.936 |
| `unclosed-Vue-expression-10000`             |       0.164 |    0.202 |
| `unclosed-Vue-expression-40000`             |       0.703 |    4.850 |
| `unclosed-absolute-css-math`                |       1.579 |    6.764 |
| `unclosed-android-resource-tags`            |       0.289 |    0.336 |
| `unclosed-color-expressions`                |       1.730 |    2.203 |
| `unclosed-css-comparison-math`              |       1.514 |    1.942 |
| `unclosed-regex-expression-10000`           |       0.180 |    0.219 |
| `unclosed-regex-expression-40000`           |       0.773 |    2.954 |
| `unclosed-stepped-css-math`                 |       2.066 |    2.729 |
| `unclosed-tag-expression-10000`             |       2.937 |    9.262 |
| `unclosed-tag-expression-40000`             |      12.394 |   19.814 |
| `unclosed-unity-constructors`               |       2.048 |    2.283 |
| `unity-component-constructors`              |       2.025 |    2.848 |
