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
