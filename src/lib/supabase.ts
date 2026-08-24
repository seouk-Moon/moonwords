import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { moonwordsAuthStorage } from "./auth-storage";

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
        storage: moonwordsAuthStorage,
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
        storage: moonwordsAuthStorage,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    cloudConfigured = true;
  }
  return supabase;
};
export const clearLocalSupabaseAuthSession = () => {
  if (typeof window === "undefined") return;
  try {
    const activeUrl = String((supabase as SupabaseClient & { supabaseUrl?: string } | null)?.supabaseUrl ?? buildSupabaseUrl);
    const projectRef = new URL(activeUrl).hostname.split(".")[0];
    if (!projectRef) return;
    const storageKey = `sb-${projectRef}-auth-token`;
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(`${storageKey}-code-verifier`);
    window.sessionStorage.removeItem(storageKey);
    window.sessionStorage.removeItem(`${storageKey}-code-verifier`);
  } catch {
    // Best-effort cleanup for a stale browser session.
  }
};

