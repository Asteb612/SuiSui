# `progress-capture.ndjson` — provenance

A **real capture**, not a hand-written fixture. It is the verbatim sentinel output of
`electron/assets/suisui-progress-reporter.cjs` running inside a genuine Playwright process.

## How it was produced

In a scratch workspace with `playwright-bdd@8.4.2` and `@playwright/test@1.49.1`:

```bash
npx bddgen
npx playwright test --reporter=list,./suisui-progress-reporter.cjs \
  | grep '^@@SUISUI_PROGRESS@@' > progress-capture.ndjson
```

The two `.feature` files beside this README are the exact sources that were run, so the
capture can be regenerated and the authored step lists in the replay test can be checked
against them.

Config: `fullyParallel: true`, `workers: 2` — the interleaving in the capture is real
scheduling, not simulated.

## What it covers

| Case                       | Where                                                      |
| -------------------------- | ---------------------------------------------------------- |
| Passing scenario           | `Valid login`                                              |
| Failing scenario           | `Invalid login is rejected`                                |
| `Background` steps         | Both `login.feature` scenarios (2 background steps first)  |
| `Scenario Outline`, 2 rows | `Buying 1 items`, `Buying 3 items` — each its own `testId` |
| Parallel interleaved tests | checkout and login events interleave throughout            |

## Two facts this capture establishes

**1. A failure ends the step stream.** When a step fails, Playwright emits _no events at
all_ for the remaining steps — there is no `skipped` step event. `Invalid login is
rejected` has 5 authored steps but only reports indexes 0–2. Marking the untouched tail as
skipped is therefore a **display-layer** decision, not something the reducer can read off
the stream.

**2. `test.id` shares a per-file prefix.** All tests in one feature file begin with the
same 20-char file hash and differ only in the suffix. Anything comparing test ids must
compare them **whole** — a truncated or prefix comparison silently merges every scenario in
a file into one.

## Regenerating

Only needed if the reporter's emitted shape changes. Re-run the recipe above; the replay
test asserts against the terminal state, so a faithful re-capture stays green.
