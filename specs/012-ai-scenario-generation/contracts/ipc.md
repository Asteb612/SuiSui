# Contract: IPC surface

**Feature**: 012-ai-scenario-generation

## No new channels

This feature adds **zero** IPC channels. The constitution's five-touchpoint IPC checklist
therefore does not apply, and `channels.ts`, `handlers.ts` and `preload.ts` are untouched.

Reused as-is:

| Channel                                  | Direction       | Role here                                             |
| ---------------------------------------- | --------------- | ----------------------------------------------------- |
| `ai:start`                               | renderer → main | Starts generation; carries the new `kind`             |
| `ai:chunk`                               | main → renderer | Streamed deltas; accumulated, not rendered as a draft |
| `ai:done`                                | main → renderer | Triggers JSON parse and index resolution              |
| `ai:error`                               | main → renderer | FR-021 failure path                                   |
| `ai:cancel`                              | renderer → main | FR-017 cancellation                                   |
| `validate:scenario`                      | renderer → main | FR-015 pre-accept check on the candidate              |
| `catalog:generate` / `catalog:getCached` | renderer → main | Available steps, now tier-stamped                     |
| `features:write`                         | renderer → main | Only via the tester's existing save (FR-014)          |

## Extended payloads

`AIGenerationRequest.kind` gains `'scenario-generate'`.

`AIRequestContext` gains `requirementRef?: string | null`, and its existing
`steps: StepDefinition[]` now arrives with `isGeneric` populated instead of always `false`.

```ts
// renderer → main, on ai:start
{
  requestId: 'uuid',
  kind: 'scenario-generate',
  input: 'A logged-in customer adds two items to the basket and checks out',
  context: {
    steps: [/* tier-stamped, project-first, budget-capped */],
    scenarioText: '<current scenario, or null when creating>',
    targetStep: null,
    requirementRef: 'https://github.com/Asteb612/SuiSui/issues/102',
  },
}
```

## Contract rules

1. **The renderer selects and orders the steps it sends.** Ranking and the 300-step budget (D4)
   run renderer-side, because the renderer holds the catalog the picker already uses. Main builds
   the prompt from what it receives and does not re-filter.
2. **`requestId` is echoed** on every chunk, done and error, as today. A response whose
   `requestId` is not the in-flight one is discarded — a superseded regenerate must never resolve
   into the current review.
3. **Main never mutates a scenario.** `AIService` has no path to `features:write`. This preserves
   the existing class invariant: "This service never inserts into a scenario."
4. **No credentials or secrets in `context`** (FR-023). Steps carry patterns and parameter names
   only; the requirement reference is tester-supplied text.
5. **Cancellation is terminal.** After `ai:cancel` for a `requestId`, any late chunk for it is
   dropped, and no draft is produced.
