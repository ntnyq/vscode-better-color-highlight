# Color detection performance baseline

The [latest complete run](#complete-baseline-2026-10-25) covers all 23 fixtures
in the v0.9.0 preparation tree. Earlier measurements below are historical.

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
macOS arm64, Apple M1 Pro. All 23 fixtures ran together after builds and
extension-host tests finished. Each latency covers the complete fixture;
benchmarks exclude provider/decorations and filesystem I/O. The external
CSS-variable fixture resolves 100 uses against declarations already loaded
from another source, measuring resolver work rather than file loading.

| Fixture                                                    | Median (ms) | p99 (ms) |
| ---------------------------------------------------------- | ----------: | -------: |
| 400 rules with stepped channels and calculated mix weights |       5.028 |    6.803 |
| 300 rejected stepped/weight expressions                    |       5.164 |    5.573 |
| 10,000 unclosed `round()` starts, then valid stepped math  |       2.036 |    2.738 |
| 100 external CSS custom-property resolutions               |       0.586 |    2.689 |
| 500 Android color declarations and 500 aliases             |       0.810 |    1.264 |
| Unclosed Android tag with an 80,000-character name         |       0.280 |    0.341 |
| 24 nested relative expressions around a color mix          |       2.299 |    5.513 |
| 10,000 unclosed relative color functions                   |       1.741 |    2.187 |
| 400 rules with relative comparison and alpha math          |       8.071 |    8.953 |
| 300 rejected comparison expressions at resource limits     |      12.293 |   12.917 |
| 10,000 unclosed `min()` starts, then valid alpha math      |       1.565 |    2.344 |
| 400 rules with modern RGB, legacy HSL, and math operands   |      12.972 |   14.355 |
| 300 rejected absolute expressions at resource limits       |      11.576 |   34.235 |
| 10,000 unclosed `min()` starts, then valid absolute math   |       1.562 |    2.316 |
| 10,000 space and 10,000 comma arguments, then valid math   |       1.170 |    1.450 |
| 200-link variable chain rejected at the resolution limit   |       3.320 |    6.759 |
| 400 Compose and 400 Swift constructors, both detectors     |       2.560 |    2.944 |
| 400 Unity Color and 400 Color32 constructors               |       2.008 |    2.440 |
| 10,000 unclosed Unity constructor starts                   |       2.006 |    2.220 |
| 400 CSS rules, two direct literals per rule                |       1.306 |    4.197 |
| 500 Tailwind markup elements                               |       9.619 |   10.550 |
| 10,000 Tailwind variants plus unmatched brackets           |       4.879 |    6.266 |
| 100 local CSS custom-property resolutions                  |       0.591 |    0.832 |

The stepped fixture contains 800 complete expressions. Its malformed fixture
contains 100 zero-step colors, 100 excessive weight calculations, and 100
over-depth stepped calculations. Parser tests separately verify rejection and
recovery; benchmark success alone is not a correctness assertion.

Raw statistics are written to the ignored `.benchmarks/` directory. The
absolute-rejection p99 includes a long-tail sample while its median is
11.576 ms; retain both statistics when comparing runs. These measurements
establish the current reference and do not demonstrate improvement against
older runs taken with different runtime/dependency versions. Benchmark timings
remain informational and do not impose CI timing thresholds.
