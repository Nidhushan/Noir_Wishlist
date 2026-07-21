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

export type CatalogRuntimeMode =
  | "live-only"
  | "snapshot-readonly"
  | "persistent";

export interface CatalogCapabilities {
  mode: CatalogRuntimeMode;
  canReadSnapshots: boolean;
  canPersistSnapshots: boolean;
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

export function getCronSecret(): string | null {
  return process.env.CRON_SECRET || null;
}

export function getNotificationBatchSize(): number {
  const parsed = Number(process.env.NOTIFICATION_BATCH_SIZE || "50");

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 200 ? parsed : 50;
}

export function getAnimeDetailTtlMs(): number {
  const defaultHours = 168;
  const parsedHours = Number(process.env.ANIME_DETAIL_TTL_HOURS || defaultHours);
  const hours =
    Number.isFinite(parsedHours) && parsedHours >= 1 && parsedHours <= 2160
      ? parsedHours
      : defaultHours;

  return hours * 60 * 60 * 1000;
}

export function hasSupabasePublicEnv(): boolean {
  return Boolean(getSupabasePublicEnv());
}

export function hasSupabaseServiceRoleEnv(): boolean {
  return Boolean(getSupabasePublicEnv() && getSupabaseServiceRoleKey());
}

export function getCatalogCapabilities(): CatalogCapabilities {
  const canReadSnapshots = hasSupabasePublicEnv();
  const canPersistSnapshots = hasSupabaseServiceRoleEnv();

  return {
    mode: canPersistSnapshots
      ? "persistent"
      : canReadSnapshots
        ? "snapshot-readonly"
        : "live-only",
    canReadSnapshots,
    canPersistSnapshots,
  };
}
