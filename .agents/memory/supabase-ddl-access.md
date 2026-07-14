---
name: Supabase direct-Postgres DDL needs its own DB password
description: Why the Supabase service-role key can't create tables, and what to ask the user for when DDL is needed.
---

`SUPABASE_URL_PROJECT` + `SUPABASE_SERVICE_ROLE_KEY` only grant REST/PostgREST access (CRUD on existing tables) — they cannot run `CREATE TABLE` or other DDL. To run schema migrations directly, ask the user for a separate Postgres connection string (Supabase Dashboard > Project Settings > Database > Connection string, pooler mode) as its own secret (e.g. `SUPABASE_DB_URL`), then run it with `psql "$SUPABASE_DB_URL" -f schema.sql`.

**Why:** hit "password authentication failed" even right after the user reset the DB password and confirmed the secret matched — it self-resolved a few minutes later. Looked like Supabase's password-reset propagation delay, not a real credentials mistake.

**How to apply:** if `psql` auth fails immediately after a user says they just reset/updated the DB password, don't assume the password is wrong — wait a bit and retry once or twice before asking them to reset again.
