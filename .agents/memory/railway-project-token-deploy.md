---
name: Railway deploy via project-scoped token
description: How to drive Railway CLI/GraphQL with a project-scoped RAILWAY_TOKEN (not an account token), and the free-plan ceiling that blocks new services.
---

A Railway **project token** (as opposed to an account/API token) only authorizes operations already scoped to its one linked project/environment:
- `whoami` and `list` (account-level) always fail "Unauthorized" with a project token — that's expected, not a broken token. Use `railway status` instead to confirm identity/project.
- Introspection-style GraphQL reads on *other* services (`serviceInstance`, `variables`) and even `serviceCreate` mutations returned "Not Authorized" when called directly over the GraphQL API (`backboard.railway.app/graphql/v2`) with this token — the token's write scope is narrower than the CLI's own internal calls.
- `railway add --service <name>` is interactive (prompts "Enter a variable <esc to skip>") and hangs under plain piped stdin. Wrapping it in `script -qc "..." /dev/null` (allocates a pty) lets a piped `ESC` byte actually reach the raw-mode prompt.

**Why:** saves re-discovering the "Not Authorized" dead end and the pty workaround in a future session.

**How to apply:** when deploying to Railway from the CLI/shell with only a project token in hand, go straight to `railway status`/`railway up --service <existing>` rather than trying account-level or raw-mutation calls first.

Separately: this project's Railway account is on the **Free plan**, which has a resource *provision* limit — creating a new service failed with "Free plan resource provision limit exceeded" even though 5 existing services on the project were already all in a `FAILED` deploy state (0 running replicas). Failed/non-running services still count against the free-tier service-count ceiling. Deleting unused failed services (or upgrading the plan) is a prerequisite for provisioning a new one — this needs explicit user sign-off, not something to do unilaterally.
