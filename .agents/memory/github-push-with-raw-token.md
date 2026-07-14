---
name: GitHub push without a connector
description: How to create a repo and push using a raw GITHUB_TOKEN secret when the user hasn't set up a GitHub integration/connector (no origin remote exists).
---

If only a `gitsafe-backup` remote exists (Replit's internal checkpoint remote) and the user has supplied a raw `GITHUB_TOKEN` secret directly (not via the GitHub integration/connector), the `git-remote` skill's `gitPush`/`createPullRequest` tools won't work — they expect a connected GitHub account. Fall back to plain git + the GitHub REST API:

1. `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user` to get the login.
2. `curl -X POST -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user/repos -d '{"name":"...","private":false}'` to create the repo.
3. Add `origin` with the token embedded in the URL temporarily to do the first push, then immediately `git remote set-url origin <url-without-token>` and store credentials via `git config credential.helper store` + a manually written `~/.git-credentials` line — avoids leaving the token sitting in `.git/config`, which is otherwise a plaintext file that could be surfaced or shared more easily than `~/.git-credentials`.

**Why:** Replit's checkpoint system auto-commits working-tree changes into the local repo, so by the time you need to push, `git status` is often already clean — the work is to wire up `origin`, not to author commits.

**How to apply:** only needed when `git remote -v` shows no GitHub-pointing remote and the user explicitly confirms they want a push to their own new repo using a token they've provided.
