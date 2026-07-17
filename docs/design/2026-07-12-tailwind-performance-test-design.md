# Tailwind Performance Test Stabilization

> **Status:** Implemented on 2026-07-12 in `bfe3a44`.
>
> This is a historical design record, not a roadmap. Refer to the
> [project README](../../README.md), runtime source, and tests for current
> behavior.

## Problem

The Tailwind selector regression test asserts that one invocation finishes in
less than 100 ms. GitHub Actions exceeded that threshold by 4.77 ms while the
same test passed locally ten times in 38–41 ms. The assertion measures runner
contention as well as parser complexity, so it can fail without a regression.

## Design

Keep the existing result assertion, but replace the absolute wall-clock limit
with a relative scaling check. Measure the parser on two punctuation-heavy
inputs whose sizes differ by a fixed factor, warm up the parser before taking
measurements, and assert that the larger input does not grow superlinearly
beyond a deliberately generous tolerance.

The test will use repeated measurements and compare their fastest samples.
This reduces interference from scheduler pauses while still detecting the
catastrophic backtracking regression the test was introduced to prevent.

## Alternatives

- Raising the threshold keeps the test simple but remains machine-dependent.
- Moving the check to a benchmark avoids unit-test flakes but removes the CI
  regression gate.

## Verification

- Demonstrate that a deterministic clock pause makes the old absolute check
  fail while the relative measurement helper remains unaffected.
- Run the focused Tailwind test repeatedly.
- Run the complete unit suite, formatting check, lint, and typecheck.
