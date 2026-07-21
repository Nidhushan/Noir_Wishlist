import type { CatalogAnimeRecord } from "./anime-write-types";

export function isAnimeDetailFresh(
  stored: CatalogAnimeRecord | null,
  ttlMs: number,
  now = new Date(),
): stored is CatalogAnimeRecord {
  if (stored?.metadata_tier !== "detail" || !stored.detail_synced_at) {
    return false;
  }

  const syncedAt = new Date(stored.detail_synced_at).getTime();
  const age = now.getTime() - syncedAt;
  return Number.isFinite(syncedAt) && age >= 0 && age < ttlMs;
}
