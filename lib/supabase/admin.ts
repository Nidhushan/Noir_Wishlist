import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

let cachedClient: ReturnType<typeof createClient<Database>> | null = null;

export function createSupabaseAdminClient() {
  const env = getSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!env || !serviceRoleKey) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient<Database>(env.url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}
