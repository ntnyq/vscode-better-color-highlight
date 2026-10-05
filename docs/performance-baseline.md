# Color detection performance baseline

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
