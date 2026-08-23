import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const buildSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const buildSupabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export let cloudConfigured = Boolean(
  buildSupabaseUrl && buildSupabasePublishableKey,
);

export let supabase: SupabaseClient | null = cloudConfigured
  ? createClient(buildSupabaseUrl, buildSupabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export const configureSupabase = (url?: string, publishableKey?: string) => {
  const runtimeUrl = url?.trim() ?? "";
  const runtimeKey = publishableKey?.trim() ?? "";
  if (!supabase && runtimeUrl && runtimeKey) {
    supabase = createClient(runtimeUrl, runtimeKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    cloudConfigured = true;
  }
  return supabase;
};
