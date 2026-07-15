// The Supabase admin client lives in @workspace/screener-core so the
// standalone worker (apps/worker) writes through the exact same client
// configuration. Re-exported here so existing "@/lib/supabase" imports
// throughout this app keep working unchanged.
export * from "@workspace/screener-core/supabase";
