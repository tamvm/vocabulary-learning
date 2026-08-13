# Self-hosted GitHub Actions runner (CI)

This repo’s [CI workflow](../.github/workflows/ci.yml) uses `runs-on: self-hosted`.
Jobs stay **Queued** until a runner for this repository is online.

## 1. Register a runner

1. Open **Settings → Actions → Runners → New self-hosted runner**  
   (or `https://github.com/<owner>/<repo>/settings/actions/runners/new`).
2. Choose your OS and architecture (macOS **ARM64** on Apple Silicon).
3. Run the download / extract / `./config.sh` commands GitHub shows.
   - URL: this repository
   - Labels: keep defaults (`self-hosted`, OS, arch) unless you target custom labels in the workflow
4. Start the runner:

```bash
# foreground (good for first test)
./run.sh

# or as a service
./svc.sh install
./svc.sh start
./svc.sh status
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

- **Queued forever** — runner offline; start `./run.sh` or `./svc.sh start`
- **Node version errors** — install Node 20 on the runner host; `setup-node` still needs a working environment
- **Permission errors** — ensure the service user can write the runner `_work` directory
