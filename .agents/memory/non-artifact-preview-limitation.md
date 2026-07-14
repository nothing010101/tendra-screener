---
name: Non-artifact workflows aren't previewable
description: Why a hand-rolled workflow (e.g. Next.js app not scaffolded via createArtifact) never shows up in Replit's preview pane, even when the dev server runs fine.
---

Once a Replit workspace uses the artifact system (`createArtifact`, `artifact.toml`, path-based proxy routing), the public dev domain / preview pane is fully owned by registered artifacts. A `configureWorkflow` process that isn't a registered artifact (e.g. a manually scaffolded Next.js app) will run and respond fine on its own port (verify with `curl http://localhost:<port>`), but hitting the shared public domain or using the `Screenshot` tool's `appPreview` source returns "no previewable artifacts" / 404 — there is no fallback route to a plain workflow's port.

**Why:** confirmed by testing — `Screenshot` with `appPreview` rejects unregistered `artifactDirName`, and `externalUrl` against the repl's own dev domain returned "This deployment has no previewable artifacts" even though the workflow itself returned HTTP 200 on `localhost:<port>`.

**How to apply:** before scaffolding a stack outside the supported artifact types (`react-vite`, `expo`, `slides`, `video-js`, `openscad`, plus the pre-existing `api`/`design` artifacts), warn the user that it won't be visible in Replit's preview pane and can't use the Screenshot tool — verify it only via shell (`curl`, logs). If visual iteration inside Replit matters to the user, prefer pivoting to a supported artifact type instead.
