# Coolify auto-deploy (Magic English)

Production deploy target for this repo is **Coolify** (Docker on Hetzner).

**Coolify project id:** `i8luqt7n49kugwqwfbcyrfvl` (`vocabulary-learning`)

| App | Public URL | Coolify UUID | Dockerfile | Container port |
|-----|------------|--------------|------------|----------------|
| Frontend | https://voca.kenchange.com | `zsq5wwe7xltdrrlp5ldctr3g` | `frontend/Dockerfile` | `3102` |
| Backend API | https://voca-api.kenchange.com | `yydjqewjghoex53en4o0je43` | `backend/Dockerfile` | `3012` (Coolify exposes `3112`) |

Hetzner fallback (Coolify sslip.io, HTTP only):

- Frontend: `http://zsq5wwe7xltdrrlp5ldctr3g.178.156.247.159.sslip.io`
- Backend: `http://yydjqewjghoex53en4o0je43.178.156.247.159.sslip.io`

Official Coolify docs: [GitHub Auto Deploy](https://coolify.io/docs/applications/ci-cd/github/auto-deploy) (path may vary by Coolify version: Configuration → Advanced → Auto Deploy).

---

## 1. Open the Coolify project

1. Log into your Coolify dashboard on the Hetzner VPS.
2. Open project **`i8luqt7n49kugwqwfbcyrfvl`** (`vocabulary-learning`), or find it in Projects by that UUID.
3. Prefer **two applications** in that project (backend + frontend). One combined service is possible but harder to scale and env-separate.

> Do **not** use project `ik6tx8h3y70t1zvuyqvb9et1` — that UUID is **Link Management**, not Magic English.

---

## 2. Connect GitHub (one-time)

1. Coolify → **Sources** (or Settings → Git) → add / authorize a **GitHub App** for your org/user.
2. Grant access to `tamvm/vocabulary-learning`.
3. Create applications **from GitHub** (not “public repository URL”) so webhooks and Auto Deploy work without manual hooks.

---

## 3. Create the backend application

1. **+ New Resource** → Application → GitHub → select `tamvm/vocabulary-learning`.
2. Settings that usually matter:
   - **Branch:** `main`
   - **Base Directory / Root:** `backend`
   - **Build Pack:** Dockerfile
   - **Dockerfile location:** `Dockerfile` (relative to `backend/`)
   - **Ports Exposes:** `3012`
   - Map a public domain / proxy to `3012`
3. **Environment variables** (Environment → add; do not commit these):

```bash
NODE_ENV=production
PORT=3012

SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

AI_PROVIDER=opencode
AI_API_KEY=...                 # OpenCode Go key (OPENCODE_API_KEY also accepted)
AI_MODEL=mimo-v2.5
# AI_PROVIDER=opencode-go is accepted as an alias for the same endpoint

JWT_SECRET=...   # strong random value

# Must match the browser origin (CORS)
FRONTEND_URL=https://voca.kenchange.com

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=1000
```

4. Deploy once manually; confirm `/` or a health/API route responds on the public URL.

---

## 4. Create the frontend application

1. New Application → same repo → **Root:** `frontend` → Dockerfile → expose **`3102`**.
2. Build-time env (Vite) — set in Coolify so `npm run build` embeds them:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=https://voca-api.kenchange.com/api
```

Exact names must match `frontend` usage (`VITE_*`). Rebuild after changing build-time vars.

`VITE_SUPABASE_URL` must be a hostname that resolves (NXDOMAIN breaks Google OAuth — the browser never reaches `/auth/v1/authorize`).

3. Point **https://voca.kenchange.com** at the frontend service.
4. Point **https://voca-api.kenchange.com** at the backend (dedicated host — Coolify Host rule). Do **not** use PathPrefix `https://voca.kenchange.com/api`: Traefik strips `/api` (`/api/words` → `/words` 404) and Cloudflare 502s that router.
5. Cloudflare: public hostname **`voca-api.kenchange.com`** via **cloudflared** on the Hetzner VPS (`scripts/cloudflared-voca-api.sh`). Do not use PathPrefix `voca.kenchange.com/api`.
6. Set backend `FRONTEND_URL=https://voca.kenchange.com` and redeploy backend (CORS). The SPA calls `https://voca-api.kenchange.com/api` (cross-origin; Helmet CORP is `cross-origin`).
7. In Supabase Auth → URL configuration:
   - Site URL: `https://voca.kenchange.com`
   - Redirect URLs: `https://voca.kenchange.com/**`

To apply domain + CORS/API env on the live Coolify apps: Actions → **Coolify Sync Domain** (or `scripts/coolify-sync-voca-domain.sh` on the Hetzner runner). That workflow also runs `scripts/cloudflared-voca-api.sh` to add `voca-api.kenchange.com` to the VPS tunnel ingress.

---

## 5. Deploy on merge (GitHub Actions → Coolify API)

These apps are connected with a **deploy key**, not a GitHub App source. Coolify’s “Auto Deploy” checkbox alone does **not** receive GitHub push events unless a manual Git webhook is also configured.

**Preferred path (configured in-repo):** [`.github/workflows/coolify-deploy.yml`](../.github/workflows/coolify-deploy.yml)

| Trigger | Behavior |
|---------|----------|
| PR merged / push → `main` or `master` | After workflow **CI** succeeds, deploy backend + frontend |
| Actions → **Coolify Deploy** → Run workflow | Manual deploy (`both` / `backend` / `frontend`) |
| Actions → **Coolify Sync Domain** | Set frontend FQDN to `voca.kenchange.com`, backend FQDN to `voca-api.kenchange.com`, plus `FRONTEND_URL` / `VITE_API_URL`, and redeploy |

The job runs on the repo’s **self-hosted** runner (same Hetzner host as Coolify) and calls:

`GET http://localhost:8000/api/v1/deploy?uuid=<app-uuid>&force=false`

Auth:

1. GitHub secret `COOLIFY_API_TOKEN` if set, else
2. Runner file `~/.coolify/github-actions.token` (deploy-scoped Coolify API token)

Optional when pointing `COOLIFY_BASE_URL` at a public hostname behind Cloudflare Access: secrets `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`.

### Verify

```bash
# After merging to main (CI must be green first):
gh run list --workflow "Coolify Deploy" --limit 5
gh run watch   # optional
```

Then in Coolify → project **`i8luqt7n49kugwqwfbcyrfvl`** → **Deployments**.

---

## 6. Optional: native Git webhooks

If you later connect the apps via a Coolify **GitHub App** (or add Manual Git Webhooks for each app), you can rely on Coolify Auto Deploy instead of the Actions workflow. Until then, keep `coolify-deploy.yml`.

---

## 7. Agent / PR workflow expectations

After merge to `main`:

1. Confirm CI is green, then Coolify Deploy run succeeds for project `i8luqt7n49kugwqwfbcyrfvl`.
2. Smoke-test UI + auth in a browser at **https://voca.kenchange.com**.
3. Do **not** change Coolify env/secrets during routine verify (domain/CORS sync is a separate, explicit workflow).
4. Details: `.cursor/skills/ve-pr-workflow/SKILL.md`

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Merge does nothing | CI failed (deploy waits on CI); Coolify Deploy workflow missing on `main`; runner offline |
| Deploy job auth error | Runner token at `~/.coolify/github-actions.token`, or secret `COOLIFY_API_TOKEN` |
| Build fails on `npm` / missing lockfile | Dockerfiles use `npm install`; ensure `package.json` present in base dir |
| Frontend calls wrong API | Rebuild frontend after fixing `VITE_API_URL` to `https://voca-api.kenchange.com/api` |
| CORS errors | Backend `FRONTEND_URL` must be `https://voca.kenchange.com` |
| Google login: host not found (`*.supabase.co`) | `VITE_SUPABASE_URL` is stale/NXDOMAIN; copy a live `SUPABASE_URL` from the backend app and rebuild frontend |
| `/api` on the UI host returns 502 | Use `https://voca-api.kenchange.com` (Host FQDN), not PathPrefix `voca.kenchange.com/api` |
| `voca-api.kenchange.com` 404 from Cloudflare | Add cloudflared ingress for that hostname on the VPS (`scripts/cloudflared-voca-api.sh`); catch-all tunnel rule is `http_status:404` |
| Puppeteer/Chromium issues on backend | Image already installs Chromium in `backend/Dockerfile`; check Coolify build logs / memory |
