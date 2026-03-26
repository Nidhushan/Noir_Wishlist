export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export function getSiteUrlFromHeaders(headers: Headers): string {
  const forwardedHost = headers.get("x-forwarded-host");
  const host = forwardedHost || headers.get("host");

  if (!host) {
    return getSiteUrl();
  }

  const proto =
    headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");

  return `${proto}://${host}`;
}

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function getSupabaseServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function hasSupabasePublicEnv(): boolean {
  return Boolean(getSupabasePublicEnv());
}

export function hasSupabaseServiceRoleEnv(): boolean {
  return Boolean(getSupabasePublicEnv() && getSupabaseServiceRoleKey());
}
