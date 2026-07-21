import { unstable_cache } from "next/cache";

import type { AnimeCard, AnimeDetail, PaginatedAnimeCards, SearchSort } from "@/lib/anilist";
import {
  getAnimeDetail,
  getNewEpisodesAnime,
  getPopularAnime,
  getRecentlyCompletedAnime,
  getTrendingAnime,
  isAniListTemporarilyUnavailable,
  searchAnime,
} from "@/lib/anilist";
import {
  resolveHomepageFeed,
  type FeedSnapshotReader,
  type LiveFeedProvider,
} from "@/lib/catalog/feed-service";
import { createFeedRefreshCoordinator } from "@/lib/catalog/feed-coordinator";
import { readCatalogFeedCandidates } from "@/lib/catalog/feed-repository";
import { isAnimeDetailFresh } from "@/lib/catalog/anime-freshness";
import { normalizeTitleKey } from "@/lib/catalog/anime-mappers";
import {
  persistBasicAnimeBatch,
  persistDetailAnime,
} from "@/lib/catalog/anime-service";
import type { CatalogAnimeRecord } from "@/lib/catalog/anime-write-types";
import {
  HOME_FEED_OPTIONS,
  type CatalogFeedResult,
  type HomeFeedType,
} from "@/lib/catalog/feed-types";
import { getAnimeDetailTtlMs, getCatalogCapabilities } from "@/lib/env";
import { buildNotificationObservations } from "@/lib/notifications/observation-builder";
import { processNotificationObservationBatch } from "@/lib/notifications/worker";
import { createSupabaseCatalogReadClient } from "@/lib/supabase/catalog-reader";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AnimeRecord = CatalogAnimeRecord;
const CATALOG_PAGE_SIZE = 18;
const FEED_REVALIDATE_SECONDS = 60 * 5;

export { HOME_FEED_OPTIONS };
export type { CatalogFeedResult, HomeFeedType };
export { normalizeTitleKey };

export interface CatalogSearchResult extends PaginatedAnimeCards {
  source: "database" | "anilist";
  notice: string | null;
}

export interface CatalogDetailResult {
  anime: AnimeDetail | null;
  source: "database" | "anilist";
  notice: string | null;
}

function getCatalogSnapshotDate(timeZone = "America/Chicago"): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

export function animeRecordToAnimeDetail(record: AnimeRecord): AnimeDetail {
  return {
    anilistId: record.anilist_id ?? 0,
    title: record.title_display,
    titleEnglish: record.title_english,
    titleRomaji: record.title_romaji,
    titleNative: record.title_native,
    coverImage: record.cover_image,
    bannerImage: record.banner_image,
    format: record.format,
    status: record.status,
    episodes: record.episodes,
    countryOfOrigin: record.country_of_origin,
    season: record.season,
    seasonYear: record.season_year,
    averageScore: record.average_score,
    popularity: record.popularity,
    description: record.description,
    genres: record.genres ?? [],
    siteUrl: record.site_url,
  };
}

export function animeRecordToAnimeCard(record: AnimeRecord): AnimeCard | null {
  if (!record.anilist_id) {
    return null;
  }

  return {
    anilistId: record.anilist_id,
    title: record.title_display,
    titleEnglish: record.title_english,
    titleRomaji: record.title_romaji,
    titleNative: record.title_native,
    coverImage: record.cover_image,
    bannerImage: record.banner_image,
    format: record.format,
    status: record.status,
    episodes: record.episodes,
    countryOfOrigin: record.country_of_origin,
    season: record.season,
    seasonYear: record.season_year,
    averageScore: record.average_score,
    popularity: record.popularity,
  };
}

export async function upsertAnimeBasicRecords(
  items: AnimeCard[],
  options: { throwOnError?: boolean } = {},
) {
  try {
    return await persistBasicAnimeBatch(items);
  } catch (error) {
    if (options.throwOnError) {
      throw error;
    }

    console.error("catalog.anime.basic_batch_upsert.failed", {
      anilistIds: items.map((item) => item.anilistId),
      error: error instanceof Error ? error.message : "Unknown anime batch upsert error",
    });
    return [];
  }
}

export async function upsertAnimeDetailRecord(anime: AnimeDetail) {
  try {
    return await persistDetailAnime(anime);
  } catch (error) {
    console.error("catalog.anime.detail_upsert.failed", {
      anilistId: anime.anilistId,
      error: error instanceof Error ? error.message : "Unknown anime detail upsert error",
    });
    return null;
  }
}

function getCatalogSearchPattern(query: string): string {
  return `%${query.replace(/[%*,]/g, " ").trim()}%`;
}

async function getLocalCatalogFeedUncached(page = 1): Promise<PaginatedAnimeCards> {
  const supabase = createSupabaseCatalogReadClient();

  if (!supabase) {
    return {
      items: [],
      currentPage: page,
      hasNextPage: false,
      lastPage: 1,
      total: 0,
    };
  }

  const from = (page - 1) * CATALOG_PAGE_SIZE;
  const to = from + CATALOG_PAGE_SIZE - 1;
  const { data, count, error } = await supabase
    .from("anime")
    .select("*", { count: "exact" })
    .not("anilist_id", "is", null)
    .order("popularity", { ascending: false, nullsFirst: false })
    .order("average_score", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  const items = ((data as AnimeRecord[] | null) ?? [])
    .map(animeRecordToAnimeCard)
    .filter((item): item is AnimeCard => Boolean(item));
  const total = count ?? items.length;

  return {
    items,
    currentPage: page,
    hasNextPage: to + 1 < total,
    lastPage: Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)),
    total,
  };
}

const getLocalCatalogFeedCached = unstable_cache(
  async (page: number) => getLocalCatalogFeedUncached(page),
  ["catalog-popular-feed"],
  { revalidate: FEED_REVALIDATE_SECONDS },
);

async function getLocalCatalogFeed(page = 1): Promise<PaginatedAnimeCards> {
  return getLocalCatalogFeedCached(page);
}

async function getLocalCatalogFallback(page = 1): Promise<PaginatedAnimeCards> {
  return getLocalCatalogFeed(page);
}

const homepageFeedReader: FeedSnapshotReader = {
  getSnapshotCandidates: readCatalogFeedCandidates,
  getPopularCatalogFallback: getLocalCatalogFallback,
};

const homepageFeedCoordinator = createFeedRefreshCoordinator({
  async ensureAnimeRecords(feed) {
    await upsertAnimeBasicRecords(feed.items, { throwOnError: true });
  },
  buildObservations(feedType, feed) {
    return buildNotificationObservations(feedType, feed.items);
  },
  async afterCommit(feedType) {
    if (feedType === "new-episodes" || feedType === "recently-completed") {
      await processNotificationObservationBatch();
    }
  },
  getSnapshotDate: getCatalogSnapshotDate,
});

const homepageLiveFeedProvider: LiveFeedProvider = {
  async fetchFeed(feedType, page) {
    switch (feedType) {
      case "trending":
        return getTrendingAnime(page);
      case "recently-completed":
        return getRecentlyCompletedAnime(page);
      case "new-episodes":
        return getNewEpisodesAnime(page);
      case "popular":
      default:
        return getPopularAnime(page);
    }
  },
  isTemporarilyUnavailable: isAniListTemporarilyUnavailable,
};

async function searchLocalCatalog(
  query: string,
  page: number,
  sort: SearchSort,
): Promise<PaginatedAnimeCards> {
  const supabase = createSupabaseCatalogReadClient();

  if (!supabase) {
    return {
      items: [],
      currentPage: page,
      hasNextPage: false,
      lastPage: 1,
      total: 0,
    };
  }

  const pattern = getCatalogSearchPattern(query);
  const from = (page - 1) * CATALOG_PAGE_SIZE;
  const to = from + CATALOG_PAGE_SIZE - 1;
  let request = supabase
    .from("anime")
    .select("*", { count: "exact" })
    .not("anilist_id", "is", null)
    .or(
      [
        `title_display.ilike.${pattern}`,
        `title_english.ilike.${pattern}`,
        `title_romaji.ilike.${pattern}`,
        `title_native.ilike.${pattern}`,
      ].join(","),
    );

  switch (sort) {
    case "popularity":
      request = request.order("popularity", { ascending: false, nullsFirst: false });
      break;
    case "score":
      request = request
        .order("average_score", { ascending: false, nullsFirst: false })
        .order("popularity", { ascending: false, nullsFirst: false });
      break;
    case "newest":
      request = request
        .order("season_year", { ascending: false, nullsFirst: false })
        .order("popularity", { ascending: false, nullsFirst: false });
      break;
    case "title":
      request = request.order("title_display", { ascending: true, nullsFirst: false });
      break;
    case "relevance":
    default:
      request = request
        .order("popularity", { ascending: false, nullsFirst: false })
        .order("average_score", { ascending: false, nullsFirst: false });
      break;
  }

  const { data, count } = await request.range(from, to);
  const items = ((data as AnimeRecord[] | null) ?? [])
    .map(animeRecordToAnimeCard)
    .filter((item): item is AnimeCard => Boolean(item));
  const total = count ?? items.length;

  return {
    items,
    currentPage: page,
    hasNextPage: to + 1 < total,
    lastPage: Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)),
    total,
  };
}

export async function getCatalogHomepageFeed(page = 1): Promise<CatalogFeedResult> {
  return getHomepageFeed("popular", page);
}

export async function getHomepageFeed(
  feedType: HomeFeedType,
  page = 1,
): Promise<CatalogFeedResult> {
  const capabilities = getCatalogCapabilities();

  return resolveHomepageFeed({
    feedType,
    page,
    capabilities,
    reader: capabilities.canReadSnapshots ? homepageFeedReader : null,
    coordinator: capabilities.canPersistSnapshots ? homepageFeedCoordinator : null,
    liveProvider: homepageLiveFeedProvider,
  });
}

export async function searchCatalogAnime(
  query: string,
  page = 1,
  sort: SearchSort = "relevance",
): Promise<CatalogSearchResult> {
  const localResults = await searchLocalCatalog(query, page, sort);

  if (localResults.items.length) {
    return {
      ...localResults,
      source: "database",
      notice: null,
    };
  }

  try {
    const liveResults = await searchAnime(query, page, sort);
    await upsertAnimeBasicRecords(liveResults.items);

    return {
      ...liveResults,
      source: "anilist",
      notice:
        "No local matches were found, so Noir fetched live AniList results and stored them in the catalog.",
    };
  } catch (error) {
    if (isAniListTemporarilyUnavailable(error)) {
      return {
        ...localResults,
        source: "database",
        notice:
          "AniList is temporarily unavailable. Noir is showing only the local catalog results.",
      };
    }

    throw error;
  }
}

export async function getStoredAnimeRecordByAniListId(
  anilistId: number,
): Promise<AnimeRecord | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("anime")
    .select("*")
    .eq("anilist_id", anilistId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AnimeRecord | null) ?? null;
}

export async function getStoredAnimeRecordById(id: number): Promise<AnimeRecord | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("anime")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AnimeRecord | null) ?? null;
}

export function isStoredAnimeDetailFresh(
  stored: AnimeRecord | null,
  now = new Date(),
): stored is AnimeRecord {
  return isAnimeDetailFresh(stored, getAnimeDetailTtlMs(), now);
}

export async function getHydratedAnimeDetail(
  anilistId: number,
): Promise<AnimeDetail | null> {
  const stored = await getStoredAnimeRecordByAniListId(anilistId);

  if (isStoredAnimeDetailFresh(stored)) {
    return animeRecordToAnimeDetail(stored);
  }

  try {
    const detail = await getAnimeDetail(anilistId);

    if (detail) {
      const persisted = await upsertAnimeDetailRecord(detail);
      return persisted ? animeRecordToAnimeDetail(persisted) : detail;
    }
  } catch (error) {
    if (stored) {
      return animeRecordToAnimeDetail(stored);
    }

    throw error;
  }

  return stored ? animeRecordToAnimeDetail(stored) : null;
}

export async function getCatalogAnimeDetail(
  anilistId: number,
): Promise<CatalogDetailResult> {
  const stored = await getStoredAnimeRecordByAniListId(anilistId);

  if (isStoredAnimeDetailFresh(stored)) {
    return {
      anime: animeRecordToAnimeDetail(stored),
      source: "database",
      notice: null,
    };
  }

  if (stored) {
    try {
      const detail = await getAnimeDetail(anilistId);

      if (detail) {
        const persisted = await upsertAnimeDetailRecord(detail);

        return {
          anime: persisted ? animeRecordToAnimeDetail(persisted) : detail,
          source: "anilist",
          notice: persisted
            ? null
            : "The latest AniList details are shown, but the stored catalog update was delayed.",
        };
      }
    } catch (error) {
      if (isAniListTemporarilyUnavailable(error)) {
        return {
          anime: animeRecordToAnimeDetail(stored),
          source: "database",
          notice:
            "AniList is temporarily unavailable. Noir is showing stored catalog data that may be out of date.",
        };
      }

      throw error;
    }

    return {
      anime: animeRecordToAnimeDetail(stored),
      source: "database",
      notice: null,
    };
  }

  const detail = await getAnimeDetail(anilistId);

  if (!detail) {
    return {
      anime: null,
      source: "anilist",
      notice: null,
    };
  }

  const persisted = await upsertAnimeDetailRecord(detail);

  return {
    anime: persisted ? animeRecordToAnimeDetail(persisted) : detail,
    source: "anilist",
    notice: persisted
      ? null
      : "The latest AniList details are shown, but the stored catalog update was delayed.",
  };
}

export async function ensureAnimePersisted(anilistId: number): Promise<AnimeRecord | null> {
  const stored = await getStoredAnimeRecordByAniListId(anilistId);

  if (stored) {
    return stored;
  }

  const detail = await getAnimeDetail(anilistId);

  if (!detail) {
    return null;
  }

  const upserted = await upsertAnimeDetailRecord(detail);

  return (upserted as AnimeRecord | null) ?? (await getStoredAnimeRecordByAniListId(anilistId));
}
