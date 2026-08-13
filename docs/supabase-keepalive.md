# Supabase keep-alive

Free-tier Supabase projects **auto-pause** after about **7 days** without database activity. A paused project breaks Magic English auth and API until someone manually resumes it in the Supabase dashboard.

## What we run

| Piece | Role |
|-------|------|
| [`scripts/supabase-keepalive.js`](../scripts/supabase-keepalive.js) | Cheap `HEAD` select against `profiles` / `words` / `users` (retries + long timeout for cold wake) |
| [`.github/workflows/supabase-keepalive.yml`](../.github/workflows/supabase-keepalive.yml) | Cron every **3 days** at 12:00 UTC + manual **Run workflow** |

Uses **GitHub-hosted** `ubuntu-latest` (not the self-hosted CI runner) so keep-alive still runs if the Hetzner runner is offline.

## One-time GitHub secrets

Repo → **Settings → Secrets and variables → Actions**. Add:

| Secret | Required |
|--------|----------|
| `SUPABASE_URL` | Yes (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Preferred |
| `SUPABASE_ANON_KEY` | Fallback if service role is not set |

At least one of the two keys must be present. Prefer **service role** so RLS cannot block the ping.

Never commit these values. The script only logs the URL **host** and which key type was used.

## Manual runs

```bash
# Local (loads backend/.env or .env)
npm run supabase:keepalive

# Or from Actions UI / CLI
gh workflow run supabase-keepalive.yml
gh run watch
```

## Notes

- Cron schedules only run on the **default branch** (`main`) after this workflow is merged.
- The first request after a pause can be slow; the script allows ~90s and retries up to 3 times.
- This does **not** replace a paid Supabase plan if you need guaranteed uptime / no pause policy.
