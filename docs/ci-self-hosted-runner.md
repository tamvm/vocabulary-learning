# Self-hosted GitHub Actions runner (CI)

This repo’s [CI workflow](../.github/workflows/ci.yml) uses `runs-on: self-hosted`.
Jobs stay **Queued** until a runner for this repository is online.

## Current runner (Hetzner)

| Field | Value |
|-------|--------|
| Host | Hetzner (`openclaw`) |
| Path | `~/actions-runner-vocabulary-learning` |
| Name | `hetzner-openclaw-vocabulary-learning` |
| Labels | `self-hosted`, `Linux`, `X64` |
| Version | `2.336.0` |
| Service | `actions.runner.tamvm-vocabulary-learning.hetzner-openclaw-vocabulary-learning.service` |
| Node on host | 20.x (matches [`.nvmrc`](../.nvmrc)) |

### Ops

```bash
# SSH as the runner user, then:
cd ~/actions-runner-vocabulary-learning
sudo ./svc.sh status
sudo ./svc.sh start   # if offline
sudo ./svc.sh stop
```

Confirm **Idle** (or busy with a job) under  
Settings → Actions → Runners → `hetzner-openclaw-vocabulary-learning`.

Cloud Agents may keep a short-lived registration token as  
`GITHUB_RUNNER_TOKEN_VOCABULARY_LEARNING` (plus Hetzner SSH secrets) to (re)register this runner.  
Registration tokens expire in about an hour — create a fresh one from the GitHub runners UI when needed.

## 1. Register a new runner (manual)

1. Open **Settings → Actions → Runners → New self-hosted runner**  
   (or `https://github.com/<owner>/<repo>/settings/actions/runners/new`).
2. Choose **Linux** / **x64** (this repo’s production runner).
3. Run the download / extract / `./config.sh` commands GitHub shows.
   - URL: this repository
   - Labels: keep defaults (`self-hosted`, OS, arch) unless you target custom labels in the workflow
   - Prefer a dedicated directory (e.g. `~/actions-runner-vocabulary-learning`) so other repos on the same host keep separate runners
4. Start the runner:

```bash
# foreground (good for first test)
./run.sh

# or as a service
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

5. Confirm the runner is **Idle** under Settings → Actions → Runners.

## 2. Machine requirements

- Node.js matching [`.nvmrc`](../.nvmrc) (20.x)
- Network access to GitHub Actions
- Enough disk for `_work` checkouts and `node_modules`

Do not store production secrets on the runner disk; use GitHub Actions secrets when needed.

## 3. Trigger CI

| Trigger | How |
|---------|-----|
| Push / PR | Push to `main` or open/update a PR targeting `main` |
| Manual | Actions → **CI** → **Run workflow** |
| CLI | `gh workflow run ci.yml` then `gh run watch` |

## 4. What CI runs

1. Install root + backend + frontend deps (`npm run install:deps`)
2. Build (`npm run build`)
3. Smoke tests (`npm test` → Quiz FSRS script)

## 5. Troubleshooting

- **Queued forever** — runner offline; `sudo ./svc.sh start` in the runner directory
- **Node version errors** — install Node 20 on the runner host; `setup-node` still needs a working environment
- **Permission errors** — ensure the service user can write the runner `_work` directory
- **Re-register** — create a new registration token in the GitHub UI, then  
  `./config.sh remove --token <TOKEN>` and configure again (or use `--replace`)
