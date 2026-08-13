# Karpathy anti-patterns (short)

Full examples: https://github.com/multica-ai/andrej-karpathy-skills/blob/main/EXAMPLES.md

| Principle | Anti-pattern | Fix |
|-----------|--------------|-----|
| Think Before Coding | Silently assume format/scope/fields | List assumptions; ask |
| Simplicity First | Strategy/factory for one discount fn | One fn until complexity is needed |
| Surgical Changes | Reformat quotes, add types while fixing bug | Change only lines that fix the issue |
| Goal-Driven | "Review and improve" | "Write test for X → make pass → no regressions" |

## Quick wrong vs right

**Hidden assumption:** "Add export" → dump all users to `users.json`. Right: clarify scope, format, fields, volume first.

**Over-abstraction:** ABC + Strategy + Config for `amount * percent/100`. Right: one function.

**Drive-by:** Fix empty-email crash and also "improve" username validation + comments. Right: only empty-email path.

**Vague plan:** "I'll review auth and improve it." Right: specific success criteria + verify steps.

Key insight: overcomplicated code often follows "best practices" too early. Solve today's problem simply.
