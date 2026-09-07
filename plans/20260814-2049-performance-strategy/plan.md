# Performance strategy — Magic English

**Date:** 2026-08-14  
**Status:** Plan only (no implementation in this PR)  
**Type:** Strategy / brainstorm

## Verdict

Slow “site and queries” are **three different problems**:

1. **AI wall-clock** (Learn / word analysis) — minutes; dominated by LLM + proxy ~100s.
2. **CRUD tax** — per-request Supabase client/`getUser`, groups N+1, full-table stats.
3. **Ops cold start** — free Supabase pause (keep-alive already shipped: TOM-99).

**Do not rewrite** to Next.js / Go / Workers / PlanetScale to fix (1). Stay on **React SPA + Express + Supabase**. Ship Keep-stack fixes; extract a **pg-boss worker** only if you need multi-replica or crash-safe jobs.

## Scope challenge

| Question | Answer |
|----------|--------|
| What exists? | Async Learn plan partially shipped; Postgres lesson cache; Linear backlog TOM-82/85/87/88/96/98 |
| Minimum change set? | Phase 0–1 only until measured |
| Complexity check? | Full rewrite rejected; Phase 3 gated |

## Phases

| Phase | File | Status |
|-------|------|--------|
| 0 — Measure | [phase-00-measure.md](./phase-00-measure.md) | Planned |
| 1 — Quick wins | [phase-01-quick-wins.md](./phase-01-quick-wins.md) | Planned |
| 2 — SQL + cache | [phase-02-sql-and-cache.md](./phase-02-sql-and-cache.md) | Planned |
| 3 — Only-if-needed | [phase-03-only-if-needed.md](./phase-03-only-if-needed.md) | Gated |
| Options matrix | [phase-04-options-matrix.md](./phase-04-options-matrix.md) | Reference |

## Research

- [scout/scout-01-bottlenecks.md](./scout/scout-01-bottlenecks.md)
- [research/brainstorm-01.md](./research/brainstorm-01.md)
- [reports/01-supabase-rls-auth-tax.md](./reports/01-supabase-rls-auth-tax.md)
- [reports/02-job-queue-pgboss-vs-bullmq.md](./reports/02-job-queue-pgboss-vs-bullmq.md)

## Non-goals (next PR train)

Next.js rewrite · Go/Rust API · Redis-by-default · Coolify replicas before job extract · PlanetScale/NoSQL · CF cache of authenticated `/api`

## Linear backlog (ordered)

1. TOM-85 shared Supabase client  
2. TOM-87 duplicate flashcards auth  
3. Slim Learn poll (new issue if needed)  
4. TOM-96 groups N+1  
5. TOM-82 profile aggregates (+ flashcard `/stats`)  
6. TOM-98 activity_history prune  
7. TOM-88 transcript cache by `video_id`

## Unresolved (need your call)

1. Prefer **pg-boss** (no Redis) vs BullMQ if/when extracting workers?
2. OK to **locally verify JWT** (vs remote `getUser` every time) for auth middleware?
3. Is Learn still the #1 user-visible pain, or Dashboard/Vocabulary feel slower day-to-day?
