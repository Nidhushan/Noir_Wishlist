import type { AnimeCard } from "@/lib/anilist";
import { createSupabaseCatalogReadClient } from "@/lib/supabase/catalog-reader";

import type { HomeFeedType, StoredFeedCandidate } from "./feed-types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseAnimeCard(value: unknown): AnimeCard | null {
  const record = asRecord(value);

  if (
    !record ||
    !Number.isInteger(record.anilistId) ||
    (record.anilistId as number) <= 0 ||
    typeof record.title !== "string"
  ) {
    return null;
  }

  return {
    anilistId: record.anilistId as number,
    title: record.title,
    titleEnglish: nullableString(record.titleEnglish),
    titleRomaji: nullableString(record.titleRomaji),
    titleNative: nullableString(record.titleNative),
    coverImage: nullableString(record.coverImage),
    bannerImage: nullableString(record.bannerImage),
    format: nullableString(record.format),
    status: nullableString(record.status),
    episodes: nullableNumber(record.episodes),
    countryOfOrigin: nullableString(record.countryOfOrigin),
    season: nullableString(record.season),
    seasonYear: nullableNumber(record.seasonYear),
    averageScore: nullableNumber(record.averageScore),
    popularity: nullableNumber(record.popularity),
  };
}

function parseCandidate(value: unknown): StoredFeedCandidate | null {
  const record = asRecord(value);

  if (
    !record ||
    typeof record.updatedAt !== "string" ||
    !Number.isInteger(record.page) ||
    typeof record.hasNextPage !== "boolean" ||
    !Number.isInteger(record.lastPage) ||
    !Number.isInteger(record.total) ||
    !Number.isInteger(record.itemCount) ||
    !Array.isArray(record.items)
  ) {
    return null;
  }

  const items = record.items
    .map(parseAnimeCard)
    .filter((item): item is AnimeCard => item !== null);

  return {
    items,
    currentPage: record.page as number,
    hasNextPage: record.hasNextPage,
    lastPage: record.lastPage as number,
    total: record.total as number,
    updatedAt: record.updatedAt,
    expectedItemCount: record.itemCount as number,
  };
}

export async function readCatalogFeedCandidates(
  feedType: HomeFeedType,
  page: number,
): Promise<StoredFeedCandidate[]> {
  const supabase = createSupabaseCatalogReadClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc("read_catalog_feed_candidates", {
    p_feed_type: feedType,
    p_page: page,
    p_limit: 5,
  });

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) {
    throw new Error("Catalog feed candidate response was not an array.");
  }

  return data
    .map(parseCandidate)
    .filter((candidate): candidate is StoredFeedCandidate => candidate !== null);
}
