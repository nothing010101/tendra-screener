// Server-only Supabase admin client for Phase 3+ (dev-wallet tracking, funding
// trace, bundle flags). Never import this from a "use client" component —
// it uses the service-role key. Shared by the Next.js app and the worker so
// both write through the exact same client configuration.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL_PROJECT;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Diagnostic: log exact env var presence on first call so we can distinguish
  // "env var missing" from "createClient failed" in Railway logs.
  console.log(
    "[supabase] getSupabaseAdmin() first call —",
    "SUPABASE_URL_PROJECT:", url ? `set (${url.slice(0, 30)}…)` : "MISSING",
    "| SUPABASE_SERVICE_ROLE_KEY:", key ? `set (length=${key.length})` : "MISSING",
  );

  if (!url || !key) {
    console.warn("[supabase] SUPABASE_URL_PROJECT / SUPABASE_SERVICE_ROLE_KEY not set — dev-wallet tracking disabled");
    return null;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  console.log("[supabase] createClient() succeeded — client cached");
  return cached;
}
