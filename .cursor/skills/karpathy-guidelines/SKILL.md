---
name: karpathy-guidelines
description: >-
  Behavioral guidelines to reduce common LLM coding mistakes. Use when writing,
  reviewing, or refactoring code to avoid overcomplication, make surgical
  changes, surface assumptions, and define verifiable success criteria.
license: MIT
---

# Karpathy Guidelines

From [Andrej Karpathy](https://x.com/karpathy/status/2015883857489522876) via
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills).

Always-on Cursor rule: `.cursor/rules/karpathy-guidelines.mdc`.
Examples: `references/anti-patterns.md`.

**Tradeoff:** Caution over speed. Trivial tasks — use judgment.
**Precedence:** `.cursorrules` / PR workflow win; complements `engineering-discipline`.

## 1. Think Before Coding

Don't assume. Surface tradeoffs. State assumptions; present interpretations; push back; ask when unclear.

## 2. Simplicity First

Minimum code. No speculative features, single-use abstractions, or unused configurability. 200 lines → 50? Rewrite.

## 3. Surgical Changes

Touch only what the request requires. Match style. Don't drive-by refactor. Clean up only orphans **you** created.

## 4. Goal-Driven Execution

Verifiable goals + loop:
- Fix bug → failing repro test → pass
- Multi-step: `[step] → verify: [check]`

**Working if:** lean diffs, less overengineering, questions before mistakes.
