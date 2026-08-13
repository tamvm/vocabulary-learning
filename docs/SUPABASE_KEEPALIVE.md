# Supabase keep-alive (free-tier pause)

Free Plan projects can pause after about **7 days** of low database activity.
Auth and the API then fail until someone restores the project in the dashboard.
This repo pings PostgREST on a schedule so Magic English stays reachable.

Official behavior: [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
Paid plans are not paused for inactivity.

## What runs

| Piece | Path |
|-------|------|
| Read-only ping | [`scripts/supabase-keepalive.js`](../scripts/supabase-keepalive.js) |
| GitHub Actions | [`.github/workflows/supabase-keepalive.yml`](../.github/workflows/supabase-keepalive.yml) |

The script `GET`s `/rest/v1/profiles?select=id&limit=1` (no inserts/updates).
It never prints API keys, the request body, or row data. An empty `[]` from RLS is still a successful ping.

## Cadence

| Trigger | When |
|---------|------|
| Schedule | `0 8 */3 * *` — 08:00 UTC on the 1st, 4th, 7th, … of each month (~every 3 days) |
| Manual | Actions → **Supabase keep-alive** → **Run workflow**, or `gh workflow run supabase-keepalive.yml` |

GitHub may delay cron jobs by several minutes. Three days is inside the 7-day pause window with margin.

Scheduled workflows only run after this file is on the **default branch** (`main`) and Actions are enabled for the repository.

## GitHub secrets

Settings → Secrets and variables → Actions → **New repository secret**.
Use the same values as backend production (`backend/.env` / Coolify), not the `VITE_` frontend copies.

| Secret | Required | Notes |
|--------|----------|--------|
| `SUPABASE_URL` | Yes | Project URL, e.g. `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Preferred | `anon` / public key (least privilege) |
| `SUPABASE_SERVICE_ROLE_KEY` | Fallback | Used only if the anon key is unset |

The job **fails closed** if `SUPABASE_URL` or both keys are missing (empty secrets become a failed run, not a silent skip).

Do not put keys in workflow YAML, logs, or frontend source. After adding secrets, run the workflow once with **Run workflow** to confirm HTTP 200.

## Local run

```bash
# Uses backend/.env when present (does not override env already set)
npm run keepalive
```

Or:

```bash
export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_ANON_KEY='your-anon-key'
node scripts/supabase-keepalive.js
```

Optional: `SUPABASE_KEEPALIVE_TABLE` (default `profiles`) if you need a different table with an `id` column.

## If the ping fails

- **Missing required environment** — add the secrets above; they are not the Coolify env vars until copied into GitHub.
- **HTTP 401 / 403** — wrong or revoked key; copy a fresh anon key from Supabase → Settings → API.
- **HTTP 404 / PGRST205** — table missing from the schema cache; set `SUPABASE_KEEPALIVE_TABLE` or restore migrations.
- **Timeout** — the project may already be paused; restore it in the dashboard, then re-run the workflow (cold start can take about a minute).

## Tests

```bash
node scripts/supabase-keepalive.test.js
```

Included in root `npm test`.
