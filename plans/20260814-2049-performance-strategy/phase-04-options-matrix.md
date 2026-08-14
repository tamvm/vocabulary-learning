# Options matrix — stay, evolve, or rewrite

## A) Surgical Keep-stack — **RECOMMENDED**

| Pros | Cons |
|------|------|
| Hits real bottlenecks | Alone doesn’t unlock multi-replica |
| Low migration risk | Needs disciplined Phase 0 measure |
| Reuses Learn async + Linear backlog | |

## B) Infra add-ons (selective)

| Do | Skip |
|----|------|
| CDN for SPA | CF cache `/api` auth routes |
| pg-boss worker when triggered | Redis before measured need |
| Pooler tune on errors | Coolify replicas before job extract |

## C) Partial swaps worth considering

| Swap | Verdict |
|------|---------|
| Job runner (pg-boss) | Yes when Phase 3 triggers |
| Faster AI model | Yes if quality OK |
| Fastify/Hono port | No — vanity RPS |
| Neon/RDS keeping Supabase Auth | Messy; rare |
| Clerk replace Auth | Only for Auth product pain |

## D) Full rewrites — **REJECT for performance**

Next.js · Go/Rust · Workers · self-hosted PG · microservices — high cost, **near-zero** LLM latency gain for this app.

## Stay on Supabase unless

- Connection pool exhaustion after query fixes  
- Cost at real user scale exceeds alternatives  
- Auth product blocked (SSO/org)  

Do **not** leave because “Postgres feels slow” next to 90s LLM calls.
