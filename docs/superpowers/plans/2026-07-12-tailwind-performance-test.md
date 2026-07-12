# Tailwind Performance Test Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flaky absolute Tailwind parser timing assertion with a scheduler-resistant linear-scaling regression check.

**Architecture:** Keep the change inside the existing Tailwind test module. Add a small measurement helper that returns the fastest repeated sample, verify its outlier behavior deterministically, then compare parser durations for inputs with a fixed fourfold size difference.

**Tech Stack:** TypeScript, Vitest, Node.js Performance API, pnpm

## Global Constraints

- Preserve the existing parser result assertion.
- Do not modify production parser behavior.
- Use repeated fastest-sample measurements and a generous scaling tolerance.
- Follow repository formatting: two spaces, single quotes, no semicolons, and trailing commas.

---

### Task 1: Stabilize the linear-complexity regression test

**Files:**

- Modify: `tests/tailwind-theme-colors.test.ts:1-15,372-384`
- Test: `tests/tailwind-theme-colors.test.ts`

**Interfaces:**

- Consumes: `findTailwindThemeColors(text: string)` from the existing Tailwind strategy.
- Produces: test-local `measureFastestDuration(callback, now?, samples?) => number`.

- [x] **Step 1: Write the failing helper test**

Add a test that calls the not-yet-defined helper with clock readings
`[0, 120, 120, 160, 160, 202]` and expects the fastest duration to be `40`.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk pnpm exec vitest run tests/tailwind-theme-colors.test.ts -t 'uses the fastest timing sample to ignore scheduler pauses'
```

Expected: FAIL because `measureFastestDuration` is not defined.

- [x] **Step 3: Implement the measurement helper**

Add this test-local helper above the suite:

```typescript
function measureFastestDuration(
  callback: () => void,
  now = performance.now.bind(performance),
  samples = 5,
) {
  let fastestDuration = Number.POSITIVE_INFINITY

  for (let sample = 0; sample < samples; sample++) {
    const start = now()
    callback()
    fastestDuration = Math.min(fastestDuration, now() - start)
  }

  return fastestDuration
}
```

- [x] **Step 4: Verify the helper test is GREEN**

Run the focused command from Step 2. Expected: PASS.

- [x] **Step 5: Replace the absolute threshold with scaling**

Build punctuation-heavy inputs with `2_500` and `10_000` repeated selector
segments, warm up with the small input, measure both through
`measureFastestDuration`, retain the existing expected match for the large
input, and assert:

```typescript
expect(largeDuration / smallDuration).toBeLessThan(8)
```

- [x] **Step 6: Run focused and repeated verification**

Run the Tailwind test file, then run the repaired case ten times. Expected:
all runs pass.

- [x] **Step 7: Run repository quality checks**

Run `rtk pnpm test`, `rtk pnpm format:check`, `rtk pnpm lint`, and
`pnpm typecheck`. Expected: all commands pass with no worktree artifacts.

- [x] **Step 8: Commit and push**

Stage the plan and test file, commit with
`test: stabilize Tailwind performance regression check`, then push `main`.
