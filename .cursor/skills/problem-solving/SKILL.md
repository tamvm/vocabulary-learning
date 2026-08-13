---
name: problem-solving
description: >-
  Use when stuck: complexity spirals, recurring special cases, forced "only way"
  assumptions, scale uncertainty, or innovation blocks. Symptom → technique
  dispatch for simplification, inversion, meta-patterns, collision, and scale tests.
  Derived from Microsoft Amplifier patterns (same lineage as ClaudeKit's
  problem-solving skill); adapted for this Cursor repo — not a kit slash command.
---

# Problem-solving techniques

Use when implementation is thrashing, not for routine small fixes.

## Quick dispatch

| Stuck symptom | Technique |
|---------------|-----------|
| Same thing 5 ways / growing special cases | **Simplification cascade** — one insight that deletes X, Y, Z |
| "Must be done this way" / forced design | **Inversion** — assume the opposite; what becomes possible? |
| Same bug/pattern in multiple layers | **Meta-pattern** — one rule across API / service / UI |
| Unsure it survives production load or AI volume | **Scale game** — 0, 1, 1000×, and failure modes |
| Conventional approaches keep failing | **Collision** — treat this like an unrelated successful system |
| Code wrong / test failing / unexpected output | **Debug** — use systematic debugging, not these reframes |

## How to apply

1. Name the stuck-type from the table (do not invent a sixth ritual).
2. Apply one technique; write the insight in one sentence.
3. Change the code to match the insight — delete special cases when possible.
4. Re-check against `.cursorrules` auth/Supabase/AI constraints before shipping.
5. If still stuck: reframe (wrong problem?), combine two techniques, or ask with evidence.

Useful combos: simplification + meta-pattern; scale + simplification; collision + inversion.

## Repo-specific notes

- Auth gaps that appear in both UI and API are often a **meta-pattern** fix around Supabase session + backend middleware, not two independent bugs.
- Learning flows (words, flashcards, YouTube learn, quiz) share vocabulary/quiz services — invert "one page owns the logic" if paths diverge; prefer shared service helpers over copy-pasted AI calls.
- AI cost/latency issues: scale-game bulk word analysis (1 vs 100 words) before inventing queues; reuse existing rate limiting and provider fallbacks before new infra.
- FSRS / quiz schedule pain: simplify scoring inputs and keep scheduling logic in `quizFsrs` — do not paper over bugs with more special cases.
- Do not use these techniques to justify broad refactors when a small explicit fix is enough.

## Attribution

Technique names/ideas from [Microsoft Amplifier](https://github.com/microsoft/amplifier) (insight-synthesizer / when-stuck dispatch). ClaudeKit Engineer packages the same lineage; this file is a Cursor-native rewrite for vocabulary-learning, not a copy of kit `references/*.md`.
