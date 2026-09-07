# Phase 3 — Only-if-needed (infra / partial swap)

**Priority:** Gated  
**Status:** Do not start without a trigger  
**Invasiveness:** L

## Triggers (any one with evidence)

| Trigger | Action |
|---------|--------|
| Need API replicas >1, or deploys drop Learn jobs often | Extract worker + queue |
| Proven AI model is wall-clock bottleneck | Faster/cheaper model; careful parallel steps |
| Supabase pool/cost/product wall with metrics | Pooler tune → then evaluate Neon/Auth split |

## Recommended partial swap: job runner

- Prefer **pg-boss** on existing Postgres (no Redis). See [reports/02-job-queue-pgboss-vs-bullmq.md](./reports/02-job-queue-pgboss-vs-bullmq.md).
- Express enqueues; worker runs `runLessonPreparePipeline`.
- Then Coolify can scale API replicas safely.

## Optional

- Separate scrape sidecar / drop Chromium from API image.
- Bigger box as temporary relief only.

## Explicitly out of scope unless product forces it

- Next.js App Router rewrite of Learn SPA  
- Go/Rust API rewrite  
- Cloudflare Workers + D1 for core API  
- PlanetScale / NoSQL for FSRS vocab  
- Redis “because serious apps have Redis” without a hot cache key  

## Acceptance (if entered)

- Jobs survive API restart; ≥2 API processes share work correctly.
- Or: measured model TTFT/total reduced without quality regression.
- Or: documented Supabase exit criteria met with migration plan.
