"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createSupabaseBrowserClient() {
  const env = getSupabasePublicEnv();

  if (!env) {
    return null;
  }

  if (!client) {
    client = createBrowserClient<Database>(env.url, env.anonKey);
  }

  return client;
}
