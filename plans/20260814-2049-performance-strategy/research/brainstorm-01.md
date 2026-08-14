# Brainstorm: Magic English performance strategy

**Date:** 2026-08-14  
**Scope:** Honest options from surgical Keep-stack fixes → full rewrites. Grounded in current repo + Linear review issues (TOM-82, 85, 87, 88, 96, 98) and Learn pipeline work (TOM-103/110/112 + `lessonPrepareJob.js`).  
**Constraint:** No calendar estimates — invasiveness only (files, services, migration risk, ops complexity).

---

## Verdict (read this first)

**Do not rewrite the app to make Learn feel fast.** Wall-clock is dominated by sequential LLM calls (90–120s timeouts × vocab/highlights/quiz) behind a ~100s Cloudflare/cloudflared proxy budget. Next.js, Go, Neon, or Workers will not shrink OpenAI/Ollama latency.

**Highest leverage:** (1) finish async Learn (202 + poll + progressive UI — already designed), (2) stop paying per-request tax (Axios Supabase client, double auth, poll overfetch), (3) fix known SQL N+1 / full-table aggregates, (4) only then add a real job runner if you need multi-replica or crash-safe AI jobs.

Stay on **Supabase Auth + Postgres + RLS** until you hit a concrete limit Supabase cannot meet (connection pool exhaustion, missing queue product, cost at real scale). Leaving Supabase is a product/auth/RLS rewrite, not a latency fix.

---

## Evidence snapshot (current stack)

| Pain | Where it lives | What it actually costs |
|------|----------------|------------------------|
| Learn multi-minute AI | `backend/src/services/lessonPrepareJob.js` — transcript → vocab → highlights → quiz; in-process `Set`, single replica | Proxy ~100s kills sync holds; AI is the minutes, not Express |
| 2s full-lesson poll | `Learn.jsx` `setInterval(..., 2000)` + `GET /lessons/:id` `select('*')` | Repeated transfer of transcript_cues + quiz JSON while waiting |
| Groups N+1 | `groups.js` — 1 list + **2 counts per group** | Scales with group count (TOM-96) |
| Profile full pull | `profile.js` — all `words` rows for CEFR/type/today aggregates | Memory + transfer grow with vocab (TOM-82) |
| Flashcard stats pull | `flashcards.js` `/stats` — all `cards.state` + all due `id`s | Same class as profile (full rows for counts) |
| Axios new Supabase client | `frontend/src/lib/api.js` interceptor | Dynamic import + `createClient` + `getSession` **every** API call (TOM-85); `AuthContext` already has a singleton |
| Auth `getUser` per request | `auth.js` + flashcards double-mount (TOM-87) | Extra Supabase Auth round-trip(s) on every protected call |
| Chromium in API image | `backend/Dockerfile` + `webScrapingService.js` | Fat image, RAM spikes, competes with AI/jobs on one replica |
| No Redis / HTTP cache | Whole stack | Fine at small multi-user; wrong first buy for AI latency |
| In-process jobs | Documented in Learn plans | Restart drops work; **blocks horizontal scale** |

---

## A) Keep-stack surgical fixes (ranked by leverage / effort)

Effort scale: **S** = 1–3 files, low risk · **M** = 4–10 files or 1 SQL RPC · **L** = cross-cutting + careful rollout.

| Rank | Fix | Leverage | Effort | Why |
|------|-----|----------|--------|-----|
| **1** | **Learn: never hold HTTP for AI; progressive ready states** | ★★★★★ | M | Physics: proxy ~100s. Ship/finish 202 + DB status + poll (plan already exists). UI shows vocab before highlights/quiz. |
| **2** | **Slim poll payload** | ★★★★☆ | S–M | Poll endpoint returns only `prepareJob` / status / summary / questions flags — **not** `select('*')` with cues. Or ETag / `If-None-Match`. Cuts 2s chatter bandwidth. |
| **3** | **Reuse frontend Supabase singleton in Axios** | ★★★★☆ | S | Export `AuthContext` client (or `lib/supabase.js`); interceptor reads `session.access_token` only. TOM-85. Instant DX + less work per request. |
| **4** | **Auth: verify JWT locally (or cache getUser); remove double middleware** | ★★★☆☆ | S–M | `jwt.verify` with Supabase JWT secret for `sub`/`exp`, keep RLS via user-scoped client; drop flashcards duplicate `authMiddleware`. TOM-87. |
| **5** | **Groups: one aggregated query/RPC** | ★★★☆☆ | M | SQL `GROUP BY group_id` + due filter, or view. TOM-96. |
| **6** | **Profile + flashcard stats: DB aggregates** | ★★★☆☆ | M | `count` + filtered counts / RPC; stop loading all words/cards. TOM-82. |
| **7** | **Transcript / lesson cache by `video_id`** | ★★★☆☆ | M | Skip Transcript24 when row exists (cross-user optional later). TOM-88. |
| **8** | **Prune `activity_history` JSON** | ★★☆☆☆ | S | Cap last N days on write. TOM-98. Prevents slow profile bloat. |
| **9** | **Parallelize independent AI steps where safe** | ★★☆☆☆ | M | Vocab vs highlights may share transcript; quiz needs vocab snapshot — don’t fake parallelism. Cap concurrency so one user doesn’t starve the Node process. |
| **10** | **Prefer fetch/Readability over Puppeteer; lazy-load Chromium** | ★★☆☆☆ | M | Most article URLs don’t need a browser. Shrink default RAM; optional sidecar later. |
| **11** | **Backoff / adaptive poll** | ★☆☆☆☆ | S | 2s → 3–5s after first minute; stop when tab hidden. Cosmetic vs #2. |
| **12** | **Indexes** on `words(user_id, group_id)`, `cards(user_id, due_date)`, `video_lessons(user_id, updated_at)` | ★★☆☆☆ | S | Only after EXPLAIN proves sequential scans; don’t spray indexes. |

**Opinion:** Items **1–6** are the real Keep-stack program. Anything else is polish until those ship.

---

## B) Infra upgrades without rewriting the app

| Upgrade | Helps | Doesn’t help | Invasiveness | Verdict |
|---------|-------|--------------|--------------|---------|
| **Cloudflare CDN for frontend static** | TTFB, global asset cache | API/AI latency | Low (Coolify + CF already in path) | **Do** — cheap win for SPA assets |
| **CF Cache Rules on API** | Almost nothing useful (auth’d JSON) | Learn, words, groups | Config only | **Skip** for `/api/*` authenticated routes |
| **Longer tunnel/proxy timeout** | Buys seconds for sync endpoints | Multi-minute AI; may be capped | Ops only | Band-aid; prefer async over begging for 300s |
| **Redis (Upstash / Coolify Redis)** | Job locks, rate limits, short TTL caches (group counts, transcript metadata) | LLM generation time | New service + client + failure modes | **Defer** until multi-replica or measured hot-key cache miss |
| **Queue worker (BullMQ / pg-boss / Cloud Tasks)** | Crash-safe Learn jobs; scale workers ≠ API | Model latency | New process, deploy unit, observability | **Medium phase** when leaving single-replica in-process |
| **Postgres tuning / connection pooler** | Bursty API under many users | AI | Supabase pooler settings, maybe PgBouncer awareness | Stay on Supabase pooler; tune if `max clients` errors appear |
| **Coolify API replicas >1** | Throughput for CRUD | **Breaks** in-process `lessonPrepareJob` unless jobs move to shared queue | Easy knob, hard correctness | **Do not** scale replicas before externalizing jobs |
| **Separate scrape worker / no Chromium on API** | API RAM stability | Learn AI | Dockerfile split or feature flag | Good when scrape is hot; otherwise fallback-first |
| **Bigger API box (CPU/RAM)** | Concurrent AI HTTP + Node | Single-request LLM wait | Ops | Temporary relief only |

**Opinion:** Infra order that matches this app: **CDN static → finish async Learn → slim poll → SQL aggregates → (only then) Redis/queue → replicas**.

---

## C) Partial stack swaps

Replace **one** subsystem; keep React SPA + Express surface where possible.

| Swap | Keep | Gain | Cost / risk | When |
|------|------|------|-------------|------|
| **AI job runner only** (Worker process + pg-boss or BullMQ; Express enqueues) | Routes, UI, Supabase | Durable jobs, multi-replica API, retries | New deployable; idempotency; stale-job UX already partially designed | After async HTTP pattern is solid and you need reliability/scale |
| **DB host only** (Neon / RDS / self-hosted PG) **keeping Supabase Auth** | Frontend auth, much of RLS story if you keep Supabase or migrate JWT carefully | Controllable PG, maybe cost | Split brain: Auth on Supabase, data elsewhere — **messy**; connection string + migration | Rarely worth it for this size |
| **Leave Supabase Auth → Clerk/Auth.js** | Express API shape | Different DX | Rewrite session model, RLS policies, every `req.user` path | Only if Auth product pain dominates |
| **API framework only** (Fastify / Hono on Node) | Same services | Marginal RPS | Touch every route; zero Learn win | **Not recommended** |
| **Scrape → Jina/Firecrawl/external** | Rest of app | Drop Chromium from Dockerfile | Vendor $, SSRF still your problem | If article-learn is core and Chromium hurts deploy |
| **AI provider only** (faster model / batch API) | Pipeline shape | Real wall-clock reduction | Quality regression; prompt retune | **High leverage** if quality allows — measure TTFT + total |

**Opinion:** The only partial swap with clear ROI for *this* pain profile is **job runner extraction** (plus smarter/faster models). Framework swaps are vanity.

---

## D) Full rewrites / migrations (honest for a small multi-user vocab app)

| Option | Claimed benefit | Reality for Magic English | Migration risk | Ops complexity |
|--------|-----------------|---------------------------|----------------|----------------|
| **Next.js (App Router)** SSR/RSC | “Faster,” SEO | App is authenticated SPA; Learn is client+poll+AI. SSR doesn’t shorten LLM. Rewrites routing, auth, Vite/Tailwind conventions | High (frontend rewrite) | Medium |
| **Go / Rust API** | Faster JSON | Auth+Supabase+AI orchestration dominates; you reimplement FSRS, jobs, scrape | Very high | Medium–high |
| **Neon / PlanetScale** | “Serverless DB” | You already have managed Postgres+Auth+RLS. PlanetScale MySQL = schema rewrite. Neon = PG host swap without Auth | High if leaving Supabase Auth | Medium |
| **Self-hosted PG** | Control, cost | You own backups, HA, RLS enforcement, auth | High | **High** — wrong for small team |
| **Cloudflare Workers + D1/DO** | Edge |  AI timeouts, Puppeteer, long jobs **fight** Workers limits; Express port is a rewrite | Very high | Medium (different failure modes) |
| **Supabase Edge Functions only** | Collapse API | Long AI + Chromium unfit; cold starts; dual runtime | High | Medium |
| **Monolith → microservices** | Scale pieces | One product, few users — distributed complexity with no traffic | Extreme | Extreme |

**Opinion:** Full rewrite ROI is **negative** until Keep-stack + job runner are exhausted **and** user growth forces it. Prefer **evolution**: SPA + Express + Supabase + worker process.

---

## E) What NOT to do

1. **Rewrite frontend/backend to “fix AI latency.”** Latency is model + sequential pipeline + proxy physics.
2. **Add Redis “because every serious app has Redis”** before measuring cacheable hot paths.
3. **Scale Coolify replicas** while Learn jobs are in-process memory.
4. **Cache authenticated `/api` at Cloudflare** (stale private data / auth bugs).
5. **Move to PlanetScale / NoSQL** for relational vocab/groups/FSRS — wrong data model.
6. **GraphQL “to fix N+1”** — fix the two SQL endpoints; don’t add a query layer.
7. **WebSockets for Learn status** as first move — 2s poll is ugly but fine; slim the payload first. Upgrade to SSE/WS only if poll volume hurts.
8. **Map-reduce every transcript** before simple async + sampling already in `lessonPrepareJob` (`VOCAB_SAMPLE_CHARS`, etc.) is proven insufficient.
9. **Premature multi-region DB** — users aren’t latency-bound on Postgres RTT relative to 90s LLM calls.
10. **Big-bang “clean architecture” refactor** while shipping Learn reliability.

---

## F) Recommended phased strategy

### Phase 0 — Measure (invasiveness: S)

- Log Learn step timings (already partially logged `[learn-job]`).
- One browser Network panel pass: poll payload size, groups waterfall, profile payload.
- Confirm proxy budget (~100s) as hard constraint for any sync AI route.

**Exit:** Numbers attached to each pain (ms / KB / query count).

### Phase 1 — Quick wins (invasiveness: S–M, ~handful of files)

1. Shared Supabase client in Axios (TOM-85).
2. Remove duplicate flashcards auth (TOM-87); consider local JWT verify.
3. Slim `GET /lessons/:id` for poll (status projection) + adaptive interval.
4. Finish/guard Learn async: no sync AI behind proxy (align with existing Learn plans).
5. Prune activity_history on write (TOM-98).

**Exit:** CRUD feels snappier; Learn never 502s due to waiting on LLM; poll is cheap.

### Phase 2 — Medium (invasiveness: M, SQL + route changes)

1. Groups aggregate RPC/view (TOM-96).
2. Profile + flashcard stats aggregates (TOM-82 + stats route).
3. Transcript cache by `video_id` (TOM-88).
4. Puppeteer fallback-first / optional Chromium path.
5. Frontend static CDN caching confirmed.

**Exit:** Dashboard/groups/profile scale with vocabulary size; API image thinner or scrape quieter.

### Phase 3 — Only-if-needed migrations (invasiveness: L)

Trigger Phase 3 only if one of these is true:

- Need **>1 API replica** or jobs die on deploy too often → **extract worker + queue** (pg-boss on Postgres is KISS; Redis+BullMQ if you already pay for Redis).
- AI provider is the bottleneck with proof → **faster/cheaper model** or parallel where safe — not a new language.
- Supabase **connection/cost/feature** wall with metrics → evaluate Neon+Auth split or full leave (see G).

**Do not** enter Phase 3 for “architecture purity.”

---

## G) Decision criteria: stay on Supabase vs leave

### Stay on Supabase when (default)

- Auth + RLS + realtime still match the product (they do today).
- Pain is AI latency, N+1, or poll overfetch — **none require leaving**.
- Team size is small; managed Auth/Postgres is leverage.
- Coolify deploys API/frontend; Supabase stays the system of record.

### Leave (or split) only when you can check a box with evidence

| Signal | Prefer | Avoid |
|--------|--------|-------|
| `max clients` / pool storms under real concurrency | Pooler tuning, then maybe dedicated PG | Immediate full rewrite |
| Need durable multi-worker jobs | **pg-boss / BullMQ** still talking to Supabase PG | Moving DB |
| Auth product blocked (SSO, org model) | Clerk/Auth.js + keep PG | Rewriting vocab domain |
| Cost at N users exceeds alternatives **after** query fixes | Neon or RDS with migration plan | Early optimization |
| Need edge SSR for marketing | Small Next marketing site **beside** SPA | Porting Learn into Workers |

### Anti-criteria (do not leave because…)

- “Postgres is slow” without EXPLAIN.
- “Edge is modern.”
- “Express is old.”
- Competitor blog used Neon/PlanetScale.

---

## Options comparison (if forced to pick one path)

| Path | Pros | Cons | Recommendation |
|------|------|------|----------------|
| **A — Surgical Keep-stack** | Matches bottlenecks; low risk; reuses Learn job design | Doesn’t unlock multi-replica alone | **Primary — do this** |
| **B — Infra add-ons** | CDN/queue help real ops | Redis/replicas without job extract = footgun | **Secondary — selective** |
| **C — Partial swaps** | Job runner / model swap targeted | Framework/DB host swaps rarely pay | **Job runner + models only** |
| **D — Full rewrite** | Greenfield fantasy | Destroys velocity; doesn’t fix LLM | **Reject for performance** |

---

## Success metrics (verify, don’t vibe)

| Area | Metric |
|------|--------|
| Learn | Paste long video: first useful UI (vocab/study) **before proxy kill**; highlights/quiz via status without Network Error |
| Poll | Status poll response size ≪ full lesson; interval backoff when backgrounded |
| Groups | `GET /api/groups` query count **O(1)** vs O(groups) |
| Profile/stats | No full `words`/`cards` row download for aggregates |
| Auth path | No `createClient` per Axios call; ≤1 token validation work per request |
| Scale gate | Replicas >1 only after jobs are not in-process memory |

---

## Next steps (for implementers / follow-up plans)

1. Turn Phase 1 into a dated `plans/YYYYMMDD-*/` with phases (or attach to existing Learn async plan).
2. File/keep Linear links: TOM-85, 87, 82, 96, 98, 88 as the Keep-stack backlog ordered as in §A.
3. Explicitly **non-goals** for the next PR train: Next.js, Go API, Redis, Coolify replica bump.

---

## References (repo)

- `frontend/src/lib/api.js` — per-request Supabase client  
- `frontend/src/pages/Learn.jsx` — 2s poll  
- `backend/src/services/lessonPrepareJob.js` — in-process pipeline  
- `backend/src/routes/groups.js`, `profile.js`, `flashcards.js` — N+1 / full pulls  
- `backend/src/middleware/auth.js` — `getUser` every request  
- `backend/Dockerfile` — Chromium on API image  
- `plans/20260814-0659-learn-long-video-proxy-timeout/` — async Learn design already recommended  
