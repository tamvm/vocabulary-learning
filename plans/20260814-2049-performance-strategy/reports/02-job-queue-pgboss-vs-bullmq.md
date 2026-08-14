# Research: Job queues for Learn pipeline (pg-boss vs BullMQ)

**Date:** 2026-08-14  
**Context:** Coolify single-server / single-replica today; Learn jobs in-process; no Redis.

## Executive summary

For Magic English, **pg-boss on existing Supabase/Postgres** is the KISS choice when leaving in-process jobs. Add Redis+BullMQ only if you already run Redis or need thousands of jobs/min (you don’t).

## Comparison (this product)

| | pg-boss | BullMQ |
|--|---------|--------|
| Backend | Postgres (already have) | Redis (new service) |
| Ops on Coolify | No new container | Redis + persistence `noeviction` |
| Throughput | Fine for lesson/word AI jobs | Overkill here |
| Crash-safe / multi-worker | Yes (SKIP LOCKED) | Yes |
| Extra cost | Schema only | Redis memory + ops |

## When to extract a worker

Only after async HTTP (202 + poll) is solid **and** one of:

- Deploy/restart drops in-flight Learn jobs often enough to hurt UX.
- Need Coolify API replicas >1.
- Concurrent Learn sessions starve the API event loop.

## Recommendation

Phase 3 (only-if-needed): Express enqueues → worker process runs `runLessonPreparePipeline`. Prefer **pg-boss**. Do not add Redis “just in case.”
