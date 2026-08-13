# Coolify auto-deploy (Magic English)

Production deploy target for this repo is **Coolify** (Docker on Hetzner).

**Coolify project id:** `i8luqt7n49kugwqwfbcyrfvl` (`vocabulary-learning`)

| App | Coolify UUID | Dockerfile | Container port |
|-----|--------------|------------|----------------|
| Backend API | `yydjqewjghoex53en4o0je43` | `backend/Dockerfile` | `3012` (Coolify exposes `3112`) |
| Frontend | `zsq5wwe7xltdrrlp5ldctr3g` | `frontend/Dockerfile` | `3102` |

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

AI_PROVIDER=ollama-cloud
AI_API_KEY=...
AI_MODEL=...

JWT_SECRET=...   # strong random value

# Set after frontend domain exists
FRONTEND_URL=https://your-frontend-domain

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=1000
```

4. Deploy once manually; confirm `/` or a health/API route responds on the public URL.

---

## 4. Create the frontend application

1. New Application → same repo → **Root:** `frontend` → Dockerfile → expose **`3102`**.
2. Build-time env (Vite) — set in Coolify so `npm run build` embeds them:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=https://your-backend-domain/api
```

Exact names must match `frontend` usage (`VITE_*`). Rebuild after changing build-time vars.

3. Point a domain at the frontend service.
4. Update backend `FRONTEND_URL` to that domain and redeploy backend (CORS).

---

## 5. Deploy on merge (GitHub Actions → Coolify API)

These apps are connected with a **deploy key**, not a GitHub App source. Coolify’s “Auto Deploy” checkbox alone does **not** receive GitHub push events unless a manual Git webhook is also configured.

**Preferred path (configured in-repo):** [`.github/workflows/coolify-deploy.yml`](../.github/workflows/coolify-deploy.yml)

| Trigger | Behavior |
|---------|----------|
| PR merged / push → `main` or `master` | After workflow **CI** succeeds, deploy backend + frontend |
| Actions → **Coolify Deploy** → Run workflow | Manual deploy (`both` / `backend` / `frontend`) |

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
2. Smoke-test UI + auth in a browser.
3. Do **not** change Coolify env/secrets during routine verify.
4. Details: `.cursor/skills/ve-pr-workflow/SKILL.md`

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Merge does nothing | CI failed (deploy waits on CI); Coolify Deploy workflow missing on `main`; runner offline |
| Deploy job auth error | Runner token at `~/.coolify/github-actions.token`, or secret `COOLIFY_API_TOKEN` |
| Build fails on `npm` / missing lockfile | Dockerfiles use `npm install`; ensure `package.json` present in base dir |
| Frontend calls wrong API | Rebuild frontend after fixing `VITE_API_URL` |
| CORS errors | Backend `FRONTEND_URL` must match the real frontend origin |
| Puppeteer/Chromium issues on backend | Image already installs Chromium in `backend/Dockerfile`; check Coolify build logs / memory |
