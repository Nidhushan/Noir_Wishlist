import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

let cachedClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Creates a server-side, anonymous catalog client. It can only read rows allowed
 * by RLS and never receives the service-role key or a user's session cookies.
 */
export function createSupabaseCatalogReadClient() {
  const env = getSupabasePublicEnv();

  if (!env) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient<Database>(env.url, env.anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}
