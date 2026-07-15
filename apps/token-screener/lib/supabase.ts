// Server-only Supabase admin client for Phase 3+ (dev-wallet tracking, funding
// trace, bundle flags). Never import this from a "use client" component —
// it uses the service-role key.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL_PROJECT;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[supabase] SUPABASE_URL_PROJECT / SUPABASE_SERVICE_ROLE_KEY not set — dev-wallet tracking disabled");
    return null;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}
