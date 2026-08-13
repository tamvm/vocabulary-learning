---
name: ve-pr-workflow
description: >-
  Start a fix/feature in a git worktree, open a PR, babysit CI and reviews until
  [ready], then on user request merge to main, verify deploy, smoke-test the app,
  and remove the worktree.
---

# Magic English (vocabulary-learning) PR worktree workflow

Use this skill when starting a fix/feature, babysitting a PR, or when the user asks to merge/deploy.

CI: self-hosted GitHub Actions — `.github/workflows/ci.yml`  
Runner setup: `docs/ci-self-hosted-runner.md`  
Deploy: Coolify on Hetzner (Docker); project id `i8luqt7n49kugwqwfbcyrfvl`  
Setup guide: `docs/COOLIFY_DEPLOYMENT.md`  
Merge/push to `main` or `master`: CI, then `.github/workflows/coolify-deploy.yml`

## 1. Start worktree

From the main repo (not an existing PR worktree):

```bash
mkdir -p ../vl-worktrees
git fetch origin main
```

Prefer opening an **open (non-draft)** PR early so the PR number is known, then:

```bash
git worktree add -b <branch> ../vl-worktrees/pr-<N> origin/main
```

If the PR number is not known yet:

```bash
git worktree add -b <branch> ../vl-worktrees/<short-slug> origin/main
# After PR #N exists, move/rename:
git worktree move ../vl-worktrees/<short-slug> ../vl-worktrees/pr-<N>
```

- Branch names: `feat/...`, `fix/...`, `ci/...`, or short kebab from the task
- Commits: conventional (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`)
- Base branch: `main`
- Move agent root into the worktree (`move_agent_to_root`) when available
- Set active branch UI (`SetActiveBranch`)

## 2. Open PR and rename session

1. Push the branch and open a PR to `main` as **open / ready for review** — **never draft** unless the user explicitly asks for a draft.
   - `ManagePullRequest` `create_pr`: always pass `draft: false` (tool default is draft — override it).
   - If a draft was created: immediately undraft with `gh pr ready <N>`. Verify with `gh pr view <N> --json isDraft` — must be `false` before finishing.
   - Draft PRs skip review bots and often skip / fail to re-trigger CI on undraft; do not leave a PR in draft.
2. Rename the chat via `rename_chat` when available (authorized by project workflow):
   - **Linear / todo-sourced**: rename to the issue id immediately. After the PR exists, use `<ISSUE> - PR-<PR#> - Short title`.
   - **Otherwise:** `vl-<PR#>` after the PR exists (e.g. `vl-12`)
3. Keep related commits only (`git log --oneline origin/main..HEAD`)
4. If the PR includes **UI changes**, attach screenshots in the PR description (required — see below)

### UI screenshots (required for frontend/UI PRs)

When the change affects UI (layout, styles, components, modals, pages):

1. Capture screenshots of the changed views (desktop; mobile too if the change is responsive-sensitive). Prefer before/after when fixing a visual bug; after-only is fine for new UI.
2. Save images under `docs/` (e.g. `docs/pr-<N>-learn-after.png`) and commit them, **or** use cloud-agent artifacts and embed with absolute paths in the PR body (ManagePullRequest uploads those automatically).
3. Embed in the PR description, for example:

```markdown
## Screenshots
<img alt="Learn after" src="docs/pr-12-learn-after.png" />
```

Or with an absolute artifact path for ManagePullRequest:

```html
<img alt="Learn after" src="/opt/cursor/artifacts/screenshots/learn-after.png" />
```

4. Do **not** mark the PR `[ready]` until screenshots are in the description.
5. Non-UI PRs (docs-only, API-only with no visible change) skip this.

## 3. Babysit until ready

Loop until merge-ready:

1. **CI** — Watch required checks; fix failures caused by this PR; push and re-watch. Self-hosted runner must be **Idle** or jobs stay Queued (see `docs/ci-self-hosted-runner.md`). If no runner yet, still run `npm run build` / `npm test` locally before `[ready]`.
2. **Reviews (mandatory)** — Address **every** review comment / thread (human, Bugbot, Copilot, Kilo, Cursor Bugbot, etc.). **No silent ignores.** For each thread, do exactly one of:
   - **Fix** — implement the change, push, reply briefly with what changed, and resolve the thread when possible, **or**
   - **Reply not relevant** — post a short GitHub reply on that thread explaining why no code change is needed. Resolve after replying when appropriate.
   - Before `[ready]` or merge: inventory unresolved threads and confirm each is fixed or replied-to. Prefer fixing over arguing; reply-only when feedback is clearly wrong or out of scope.
3. **Conflicts** — Resolve merge conflicts intelligently; if intents conflict, ask the user
4. **Title** — When checks are green, **all review threads are fixed or replied-to**, and UI screenshots (if applicable) are in the PR body, ensure the PR title has a `[ready]` prefix
   - **On every new push:** immediately **remove** the `[ready]` prefix from the PR title. Only re-add `[ready]` after CI/local verification is green again and the babysit checklist above is satisfied.

Do **not** merge until the user explicitly asks. A merge ask still requires every review thread to be fixed or replied-to first.

## 4. Merge + verify deploy

Only after the user says to merge.

**Hard gate — fix reviews first.** An explicit merge ask does **not** skip this. Inventory unresolved GitHub review threads (human, Bugbot, Copilot, Kilo, Cursor Bugbot, etc.). For each: **fix** (push + reply) or **reply why not relevant**. Do not merge while any thread is unanswered. Never merge “and fix reviews later.”

Then:

```bash
gh pr merge <N> --merge
```

Use a merge commit (no squash) to match repo rules.

Push/merge to `main` should run **CI** then **Coolify Deploy** (project `i8luqt7n49kugwqwfbcyrfvl`). Then:

1. Watch `gh run list --workflow "Coolify Deploy"` and Coolify Deployments. If stuck, `gh workflow run coolify-deploy.yml` or Redeploy in Coolify UI (do not mutate env/secrets routinely).
2. Smoke-test the app in a **browser** at **https://voca.kenchange.com**. Do not rely on curl alone for UI regressions.
3. Confirm auth still works (Supabase session) and learning flows load.
4. Report deploy status and smoke-test result to the user.

Do not change Coolify env vars or secrets during routine deploy.

## 5. Cleanup (required after merge)

From the main repo after a successful merge:

```bash
git worktree remove ../vl-worktrees/pr-<N>
git branch -d <branch>   # if fully merged and unused
```

If the worktree is dirty, stop and ask — do not force-remove silently.

## Must not

- Merge without an explicit user ask
- Merge (even after an explicit user ask) while any review thread is unanswered — **fix or reply first, then merge**
- Mark a UI-change PR `[ready]` without screenshots in the PR description
- Mark `[ready]` or merge while any review thread is unanswered (must fix **or** reply why not relevant)
- Ignore review feedback without a code fix or a GitHub reply on that thread
- Leave `[ready]` on the title after pushing new commits (strip it on push; re-add only when green again)
- Skip worktree cleanup after a successful merge
- Force-push to `main` or skip hooks
- Rely only on title automation without addressing review comments
- Mutate Coolify secrets as part of routine deploy (use `coolify-sync-domain.yml` only when asked to change the public domain / CORS)
