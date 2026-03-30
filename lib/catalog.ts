import { unstable_cache } from "next/cache";

import type { AnimeCard, AnimeDetail, PaginatedAnimeCards, SearchSort } from "@/lib/anilist";
import {
  getAnimeDetail,
  getNewEpisodesAnime,
  getTrendingAnime,
  isAniListTemporarilyUnavailable,
  searchAnime,
} from "@/lib/anilist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AnimeRecord = Database["public"]["Tables"]["anime"]["Row"];
type CatalogFeedSnapshotRecord = Database["public"]["Tables"]["catalog_feed_snapshots"]["Row"];
type CatalogFeedSnapshotInsert =
  Database["public"]["Tables"]["catalog_feed_snapshots"]["Insert"];
type CatalogFeedItemRecord = Database["public"]["Tables"]["catalog_feed_items"]["Row"];
type CatalogFeedItemInsert = Database["public"]["Tables"]["catalog_feed_items"]["Insert"];
type AnimeInsert = Database["public"]["Tables"]["anime"]["Insert"];
type AnimeUpdate = Database["public"]["Tables"]["anime"]["Update"];
const CATALOG_PAGE_SIZE = 18;
const FEED_REVALIDATE_SECONDS = 60 * 5;

export const HOME_FEED_OPTIONS = [
  { value: "popular", label: "Popular" },
  { value: "trending", label: "Trending" },
  { value: "new-episodes", label: "New Episodes" },
] as const;

export type HomeFeedType = (typeof HOME_FEED_OPTIONS)[number]["value"];

export interface CatalogFeedResult extends PaginatedAnimeCards {
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

export function normalizeTitleKey(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAniListTitleCandidates(anime: AnimeCard | AnimeDetail): string[] {
  const candidates = [
    anime.title,
    anime.titleEnglish,
    anime.titleRomaji,
    anime.titleNative,
  ]
    .map((value) => normalizeTitleKey(value))
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

function toBasicAnimeInsert(anime: AnimeCard): AnimeInsert {
  return {
    anilist_id: anime.anilistId,
    source_provider: "anilist",
    source_urls: [`https://anilist.co/anime/${anime.anilistId}`],
    title_display: anime.title,
    title_normalized: normalizeTitleKey(anime.title),
    title_english: anime.titleEnglish,
    title_romaji: anime.titleRomaji,
    title_native: anime.titleNative,
    cover_image: anime.coverImage,
    banner_image: anime.bannerImage,
    format: anime.format,
    status: anime.status,
    episodes: anime.episodes,
    country_of_origin: anime.countryOfOrigin,
    season: anime.season,
    season_year: anime.seasonYear,
    average_score: anime.averageScore,
    popularity: anime.popularity,
    metadata_tier: "basic",
    last_synced_at: new Date().toISOString(),
  };
}

function toDetailAnimeInsert(anime: AnimeDetail): AnimeInsert {
  return {
    ...toBasicAnimeInsert(anime),
    description: anime.description,
    genres: anime.genres,
    site_url: anime.siteUrl,
    metadata_tier: "detail",
    detail_synced_at: new Date().toISOString(),
  };
}

function toDetailAnimeUpdate(anime: AnimeDetail): AnimeUpdate {
  return toDetailAnimeInsert(anime);
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

async function findExistingAnimeForAniList(
  anime: AnimeCard | AnimeDetail,
): Promise<AnimeRecord | null> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const { data: anilistMatch } = await supabase
    .from("anime")
    .select("*")
    .eq("anilist_id", anime.anilistId)
    .maybeSingle();

  if (anilistMatch) {
    return anilistMatch as AnimeRecord;
  }

  const titleCandidates = getAniListTitleCandidates(anime);

  if (!titleCandidates.length) {
    return null;
  }

  const { data: titleMatches } = await supabase
    .from("anime")
    .select("*")
    .is("anilist_id", null)
    .in("title_normalized", titleCandidates)
    .limit(2);

  if (titleMatches && titleMatches.length === 1) {
    return titleMatches[0] as AnimeRecord;
  }

  return null;
}

async function upsertSingleAnimeBasicRecord(anime: AnimeCard) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const existing = await findExistingAnimeForAniList(anime);
  const payload = toBasicAnimeInsert(anime);

  if (existing) {
    const { data } = await supabase
      .from("anime")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    return data;
  }

  const { data } = await supabase
    .from("anime")
    .insert(payload)
    .select("*")
    .single();

  return data;
}

export async function upsertAnimeBasicRecords(items: AnimeCard[]) {
  for (const item of items) {
    await upsertSingleAnimeBasicRecord(item);
  }
}

export async function upsertAnimeDetailRecord(anime: AnimeDetail) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const existing = await findExistingAnimeForAniList(anime);
  const updatePayload = toDetailAnimeUpdate(anime);
  const insertPayload = toDetailAnimeInsert(anime);

  if (existing) {
    const { data } = await supabase
      .from("anime")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("*")
      .single();

    return data;
  }

  const { data } = await supabase
    .from("anime")
    .insert(insertPayload)
    .select("*")
    .single();

  return data;
}

function getCatalogSearchPattern(query: string): string {
  return `%${query.replace(/[%*,]/g, " ").trim()}%`;
}

function buildFeedFromSnapshotAndItems(
  snapshot: CatalogFeedSnapshotRecord,
  items: AnimeCard[],
): CatalogFeedResult {
  return {
    items,
    currentPage: snapshot.page,
    hasNextPage: snapshot.has_next_page,
    lastPage: snapshot.last_page,
    total: snapshot.total,
    source: "database",
    notice: null,
  };
}

async function getStoredAnimeRecordsByAniListIds(
  anilistIds: number[],
): Promise<Map<number, AnimeRecord>> {
  const supabase = createSupabaseAdminClient();

  if (!supabase || !anilistIds.length) {
    return new Map();
  }

  const { data } = await supabase
    .from("anime")
    .select("*")
    .in("anilist_id", anilistIds);

  const rows = (data as AnimeRecord[] | null) ?? [];
  const rowMap = new Map<number, AnimeRecord>();

  for (const row of rows) {
    if (row.anilist_id) {
      rowMap.set(row.anilist_id, row);
    }
  }

  return rowMap;
}

async function getStoredFeedItems(
  feedType: "trending",
  snapshotDate: string,
  page: number,
): Promise<CatalogFeedItemRecord[]> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("catalog_feed_items")
    .select("*")
    .eq("feed_type", feedType)
    .eq("snapshot_date", snapshotDate)
    .eq("page", page)
    .order("position", { ascending: true });

  return (data as CatalogFeedItemRecord[] | null) ?? [];
}

async function getStoredFeedAnimeCards(feedItems: CatalogFeedItemRecord[]): Promise<AnimeCard[]> {
  const supabase = createSupabaseAdminClient();

  if (!supabase || !feedItems.length) {
    return [];
  }

  const animeIds = feedItems.map((item) => item.anime_id);
  const { data } = await supabase.from("anime").select("*").in("id", animeIds);
  const animeRows = (data as AnimeRecord[] | null) ?? [];
  const animeById = new Map<number, AnimeRecord>();

  for (const row of animeRows) {
    animeById.set(row.id, row);
  }

  return feedItems
    .map((item) => animeById.get(item.anime_id))
    .map((row) => (row ? animeRecordToAnimeCard(row) : null))
    .filter((item): item is AnimeCard => Boolean(item));
}

async function getResolvedTrendingFeedUncached(
  snapshotDate: string,
  page: number,
): Promise<CatalogFeedResult | null> {
  const snapshot = await getFeedSnapshotUncached("trending", snapshotDate, page);

  if (!snapshot) {
    return null;
  }

  const feedItems = await getStoredFeedItems("trending", snapshotDate, page);
  const items = await getStoredFeedAnimeCards(feedItems);

  return buildFeedFromSnapshotAndItems(snapshot, items);
}

const getResolvedTrendingFeedCached = unstable_cache(
  async (snapshotDate: string, page: number) =>
    getResolvedTrendingFeedUncached(snapshotDate, page),
  ["catalog-trending-feed"],
  { revalidate: FEED_REVALIDATE_SECONDS },
);

async function getResolvedTrendingFeed(
  snapshotDate: string,
  page: number,
): Promise<CatalogFeedResult | null> {
  return getResolvedTrendingFeedCached(snapshotDate, page);
}

async function getResolvedLatestTrendingFeedUncached(
  page: number,
): Promise<CatalogFeedResult | null> {
  const snapshot = await getLatestFeedSnapshotUncached("trending", page);

  if (!snapshot) {
    return null;
  }

  const feedItems = await getStoredFeedItems("trending", snapshot.snapshot_date, page);
  const items = await getStoredFeedAnimeCards(feedItems);

  return buildFeedFromSnapshotAndItems(snapshot, items);
}

const getResolvedLatestTrendingFeedCached = unstable_cache(
  async (page: number) => getResolvedLatestTrendingFeedUncached(page),
  ["catalog-trending-feed-latest"],
  { revalidate: FEED_REVALIDATE_SECONDS },
);

async function getResolvedLatestTrendingFeed(
  page: number,
): Promise<CatalogFeedResult | null> {
  return getResolvedLatestTrendingFeedCached(page);
}

async function getFeedSnapshotUncached(
  feedType: "trending",
  snapshotDate: string,
  page: number,
): Promise<CatalogFeedSnapshotRecord | null> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("catalog_feed_snapshots")
    .select("*")
    .eq("feed_type", feedType)
    .eq("snapshot_date", snapshotDate)
    .eq("page", page)
    .maybeSingle();

  return (data as CatalogFeedSnapshotRecord | null) ?? null;
}

async function getLatestFeedSnapshotUncached(
  feedType: "trending",
  page: number,
): Promise<CatalogFeedSnapshotRecord | null> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("catalog_feed_snapshots")
    .select("*")
    .eq("feed_type", feedType)
    .eq("page", page)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as CatalogFeedSnapshotRecord | null) ?? null;
}

async function storeFeedSnapshot(
  feedType: "trending",
  snapshotDate: string,
  page: number,
  feed: PaginatedAnimeCards,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const payload: CatalogFeedSnapshotInsert = {
    feed_type: feedType,
    snapshot_date: snapshotDate,
    page,
    items: [],
    total: feed.total,
    has_next_page: feed.hasNextPage,
    last_page: feed.lastPage,
    source: "anilist",
  };

  await supabase
    .from("catalog_feed_snapshots")
    .upsert(payload, {
      onConflict: "feed_type,snapshot_date,page",
    });
}

async function storeFeedItems(
  feedType: "trending",
  snapshotDate: string,
  page: number,
  feed: PaginatedAnimeCards,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  if (!supabase || !feed.items.length) {
    return;
  }

  const animeByAniListId = await getStoredAnimeRecordsByAniListIds(
    feed.items.map((item) => item.anilistId),
  );

  const payload: CatalogFeedItemInsert[] = [];

  feed.items.forEach((item, index) => {
    const anime = animeByAniListId.get(item.anilistId);

    if (!anime) {
      return;
    }

    payload.push({
      feed_type: feedType,
      snapshot_date: snapshotDate,
      page,
      position: index + 1,
      anime_id: anime.id,
    });
  });

  if (!payload.length) {
    return;
  }

  await supabase.from("catalog_feed_items").upsert(payload, {
    onConflict: "feed_type,snapshot_date,page,position",
  });
}

async function getLocalCatalogFeedUncached(page = 1): Promise<PaginatedAnimeCards> {
  const supabase = createSupabaseAdminClient();

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
  const { data, count } = await supabase
    .from("anime")
    .select("*", { count: "exact" })
    .not("anilist_id", "is", null)
    .order("popularity", { ascending: false, nullsFirst: false })
    .order("average_score", { ascending: false, nullsFirst: false })
    .range(from, to);

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

async function searchLocalCatalog(
  query: string,
  page: number,
  sort: SearchSort,
): Promise<PaginatedAnimeCards> {
  const supabase = createSupabaseAdminClient();

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

async function getPopularHomepageFeed(page = 1): Promise<CatalogFeedResult> {
  const localFeed = await getLocalCatalogFeed(page);

  if (localFeed.items.length) {
    return {
      ...localFeed,
      source: "database",
      notice: null,
    };
  }

  try {
    const liveFeed = await getTrendingAnime(page);
    await upsertAnimeBasicRecords(liveFeed.items);

    return {
      ...liveFeed,
      source: "anilist",
      notice: "Live AniList data was used because the local feed did not have enough anime yet.",
    };
  } catch (error) {
    if (isAniListTemporarilyUnavailable(error)) {
      return {
        ...localFeed,
        source: "database",
        notice:
          "AniList is temporarily unavailable. Noir is showing the local catalog feed instead.",
      };
    }

    throw error;
  }
}

async function getTrendingHomepageFeed(page = 1): Promise<CatalogFeedResult> {
  const snapshotDate = getCatalogSnapshotDate();
  const todaysFeed = await getResolvedTrendingFeed(snapshotDate, page);

  if (todaysFeed) {
    return todaysFeed;
  }

  try {
    const liveFeed = await getTrendingAnime(page);
    await upsertAnimeBasicRecords(liveFeed.items);
    await storeFeedSnapshot("trending", snapshotDate, page, liveFeed);
    await storeFeedItems("trending", snapshotDate, page, liveFeed);

    return {
      ...liveFeed,
      source: "anilist",
      notice: null,
    };
  } catch (error) {
    const latestFeed = await getResolvedLatestTrendingFeed(page);

    if (latestFeed && isAniListTemporarilyUnavailable(error)) {
      return latestFeed;
    }

    throw error;
  }
}

async function getNewEpisodesHomepageFeed(page = 1): Promise<CatalogFeedResult> {
  try {
    const liveFeed = await getNewEpisodesAnime(page);
    await upsertAnimeBasicRecords(liveFeed.items);

    return {
      ...liveFeed,
      source: "anilist",
      notice:
        "New Episodes uses live AniList schedule data, so this feed refreshes more frequently than the rest of the homepage.",
    };
  } catch (error) {
    if (isAniListTemporarilyUnavailable(error)) {
      const localFeed = await getLocalCatalogFeed(1);

      return {
        ...localFeed,
        currentPage: 1,
        lastPage: 1,
        hasNextPage: false,
        source: "database",
        notice:
          "AniList is temporarily unavailable. Noir is showing popular catalog titles until live episode data comes back.",
      };
    }

    throw error;
  }
}

export async function getHomepageFeed(
  feedType: HomeFeedType,
  page = 1,
): Promise<CatalogFeedResult> {
  switch (feedType) {
    case "trending":
      return getTrendingHomepageFeed(page);
    case "new-episodes":
      return getNewEpisodesHomepageFeed(page);
    case "popular":
    default:
      return getPopularHomepageFeed(page);
  }
}

export async function searchCatalogAnime(
  query: string,
  page = 1,
  sort: SearchSort = "relevance",
): Promise<CatalogFeedResult> {
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

  const { data } = await supabase
    .from("anime")
    .select("*")
    .eq("anilist_id", anilistId)
    .maybeSingle();

  return (data as AnimeRecord | null) ?? null;
}

export async function getStoredAnimeRecordById(id: number): Promise<AnimeRecord | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase.from("anime").select("*").eq("id", id).maybeSingle();

  return (data as AnimeRecord | null) ?? null;
}

export async function getHydratedAnimeDetail(
  anilistId: number,
): Promise<AnimeDetail | null> {
  const stored = await getStoredAnimeRecordByAniListId(anilistId);

  if (stored && stored.metadata_tier === "detail") {
    return animeRecordToAnimeDetail(stored);
  }

  try {
    const detail = await getAnimeDetail(anilistId);

    if (detail) {
      await upsertAnimeDetailRecord(detail);
      return detail;
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

  if (stored?.metadata_tier === "detail") {
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
        await upsertAnimeDetailRecord(detail);

        return {
          anime: detail,
          source: "anilist",
          notice: null,
        };
      }
    } catch (error) {
      if (isAniListTemporarilyUnavailable(error)) {
        return {
          anime: animeRecordToAnimeDetail(stored),
          source: "database",
          notice:
            "AniList is temporarily unavailable. Noir is showing the stored catalog data for this anime.",
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

  await upsertAnimeDetailRecord(detail);

  return {
    anime: detail,
    source: "anilist",
    notice: null,
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
