# Contracts: AI Scenario Generation from Available Steps

**Feature**: 012-ai-scenario-generation

Three contracts. Only the third is new surface; the first two are extensions of existing ones.

| #   | Contract                                         | Kind                           | New surface?                                            |
| --- | ------------------------------------------------ | ------------------------------ | ------------------------------------------------------- |
| 1   | [ipc.md](./ipc.md)                               | Main ↔ renderer                | **No new channel** — new `AIGenerationKind` values only |
| 2   | [gherkin-round-trip.md](./gherkin-round-trip.md) | Feature-file text ↔ `Scenario` | Extends an existing round-trip                          |
| 3   | [model-response.md](./model-response.md)         | Main ↔ LLM provider            | New, and untrusted by design                            |

## The rule that governs all three

The model's response is **untrusted input crossing a boundary**, exactly like user input or an
external API. It is validated at the boundary (Principle VI: validate at boundaries) and is never
believed about what steps exist. Every guarantee this feature makes about step authenticity is
enforced _after_ the model speaks, in `contracts/model-response.md` §Resolution — not by prompt
wording.
