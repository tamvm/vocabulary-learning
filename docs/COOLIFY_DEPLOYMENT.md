# Coolify auto-deploy (Magic English)

Production deploy target for this repo is **Coolify** (Docker on Hetzner).

**Coolify project id:** `ik6tx8h3y70t1zvuyqvb9et1`

Repo Dockerfiles:

| App | Dockerfile | Container port |
|-----|------------|----------------|
| Backend API | `backend/Dockerfile` | `3012` |
| Frontend | `frontend/Dockerfile` | `3102` |

Official Coolify docs: [GitHub Auto Deploy](https://coolify.io/docs/applications/ci-cd/github/auto-deploy) (path may vary by Coolify version: Configuration → Advanced → Auto Deploy).

---

## 1. Open the Coolify project

1. Log into your Coolify dashboard on the Hetzner VPS.
2. Open project **`ik6tx8h3y70t1zvuyqvb9et1`** (or find it in Projects by that UUID).
3. Prefer **two applications** in that project (backend + frontend). One combined service is possible but harder to scale and env-separate.

> If this project already hosts another app (e.g. link-management), add **new** applications for Magic English — do not overwrite the existing resource.

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

## 5. Enable Auto Deploy (push → deploy)

For **each** application (backend and frontend):

1. Open the app → **Configuration** → **Advanced** (or **Deployment & Git**).
2. Enable **Auto Deploy**.
3. Confirm branch is **`main`**.
4. Optional: set **Watch Paths** so backend only rebuilds on `backend/**` and frontend on `frontend/**` (if your Coolify version supports watch paths).

With GitHub App + Auto Deploy, a push to `main` starts a deployment. You do **not** need a manual GitHub webhook URL.

### Verify

```bash
# After merging / pushing to main:
git push origin main
```

Then in Coolify → **Deployments**: a new deployment for the pushed commit should appear.

If nothing appears:

- GitHub App still has access to the repo
- Auto Deploy is on
- Branch is `main`
- You are looking at the correct application under project `ik6tx8h3y70t1zvuyqvb9et1`

---

## 6. Optional: deploy webhook from GitHub Actions

Use only if you build images in CI and want Coolify to pull/redeploy on success:

1. Coolify → API token with **deploy** permission.
2. Copy the application **Deploy Webhook** URL.
3. GitHub repo secrets: `COOLIFY_TOKEN`, `COOLIFY_WEBHOOK` (per app or shared carefully).
4. After CI succeeds:

```bash
curl --request GET "$COOLIFY_WEBHOOK" \
  --header "Authorization: Bearer $COOLIFY_TOKEN"
```

Native Auto Deploy (section 5) is enough for Dockerfile-from-Git deploys.

---

## 7. Agent / PR workflow expectations

After merge to `main`:

1. Confirm Coolify deployment for project `ik6tx8h3y70t1zvuyqvb9et1` succeeds.
2. Smoke-test UI + auth in a browser.
3. Do **not** change Coolify env/secrets during routine verify.
4. Details: `.cursor/skills/ve-pr-workflow/SKILL.md`

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Push does nothing | Auto Deploy off; wrong branch; GitHub App permissions |
| Build fails on `npm` / missing lockfile | Dockerfiles use `npm install`; ensure `package.json` present in base dir |
| Frontend calls wrong API | Rebuild frontend after fixing `VITE_API_URL` |
| CORS errors | Backend `FRONTEND_URL` must match the real frontend origin |
| Puppeteer/Chromium issues on backend | Image already installs Chromium in `backend/Dockerfile`; check Coolify build logs / memory |
