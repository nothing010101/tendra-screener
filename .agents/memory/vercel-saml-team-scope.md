---
name: Vercel SAML team-scope token
description: The VERCEL_TOKEN is scoped to a SAML team ("yooohs-projects"); every API call — including personal endpoints and file-upload deployments — returns "Not authorized" until SAML auth is satisfied.
---

The `VERCEL_TOKEN` secret belongs to a Vercel SAML-enabled team with slug `yooohs-projects`. Every REST API call — even `/v2/user`, `/v13/deployments` with file uploads, and personal-scope endpoints — returns:

```json
{"error": {"code": "forbidden", "message": "Not authorized: Trying to access resource under scope \"yooohs-projects\".", "saml": true, "enforced": false}}
```

**Key facts:**
- `enforced: false` means SAML is configured but not mandatory — but the token itself is still SAML-scoped and unusable without completing a SAML session.
- The user's `defaultTeamId` is `team_Xx0O1dWXziTafgCyPMYzbSyB` but passing it as `?teamId=` makes no difference.
- Vercel CLI (`vercel@latest`) can't be installed via `npx` or `pnpm dlx` because it depends on `tar` which has a Critical CVE blocked by Replit's package firewall.
- `/v2/user` is the ONE endpoint that works (returns user id and defaultTeamId).

**Why:** The token was created inside the SAML team context; it cannot make API calls without an active SAML browser session granting that context.

**How to apply:** When this token fails with the SAML scope error, automated Vercel deployment is not possible. Tell the user to deploy manually via the Vercel dashboard: import the GitHub repo, set root directory to `artifacts/tendra-screener`, framework Vite, output directory `dist/public`, build command `cd ../.. && pnpm --filter @workspace/tendra-screener run build`, install command `cd ../.. && pnpm install --frozen-lockfile`. The `vercel.json` in the artifact's root already contains these settings so Vercel will pick them up automatically.
