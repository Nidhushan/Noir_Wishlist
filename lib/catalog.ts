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
  processNewEpisodeFeedNotifications,
  processRecentlyCompletedFeedNotifications,
} from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AnimeRecord = Database["public"]["Tables"]["anime"]["Row"];
type CatalogFeedSnapshotRecord = Database["public"]["Tables"]["catalog_feed_snapshots"]["Row"];
type CatalogFeedSnapshotInsert =
  Database["public"]["Tables"]["catalog_feed_snapshots"]["Insert"];
type CatalogFeedItemRecord = Database["public"]["Tables"]["catalog_feed_items"]["Row"];
type CatalogFeedItemInsert = Database["public"]["Tables"]["catalog_feed_items"]["Insert"];
type FeedRefreshStateRecord = Database["public"]["Tables"]["feed_refresh_state"]["Row"];
type FeedRefreshStateUpdate = Database["public"]["Tables"]["feed_refresh_state"]["Update"];
type AnimeInsert = Database["public"]["Tables"]["anime"]["Insert"];
type AnimeUpdate = Database["public"]["Tables"]["anime"]["Update"];
const CATALOG_PAGE_SIZE = 18;
const FEED_REVALIDATE_SECONDS = 60 * 5;
const FEED_REFRESH_INTERVALS_MS = {
  popular: 1000 * 60 * 60 * 24 * 7,
  trending: 1000 * 60 * 60 * 24,
  "recently-completed": 1000 * 60 * 60 * 24,
  "new-episodes": 1000 * 60 * 10,
} as const;
const FEED_FAILURE_COOLDOWN_MS = 1000 * 60 * 10;

export const HOME_FEED_OPTIONS = [
  { value: "popular", label: "Popular" },
  { value: "trending", label: "Trending" },
  { value: "recently-completed", label: "Recently Completed" },
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

function getFeedRefreshIntervalMs(feedType: HomeFeedType): number {
  return FEED_REFRESH_INTERVALS_MS[feedType];
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
  feedType: HomeFeedType,
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

async function getResolvedFeed(
  feedType: HomeFeedType,
  snapshotDate: string,
  page: number,
): Promise<CatalogFeedResult | null> {
  const snapshot = await getFeedSnapshot(feedType, snapshotDate, page);

  if (!snapshot) {
    return null;
  }

  const feedItems = await getStoredFeedItems(feedType, snapshotDate, page);
  const items = await getStoredFeedAnimeCards(feedItems);

  return buildFeedFromSnapshotAndItems(snapshot, items);
}

async function getResolvedLatestFeed(
  feedType: HomeFeedType,
  page: number,
): Promise<CatalogFeedResult | null> {
  const snapshot = await getLatestFeedSnapshot(feedType, page);

  if (!snapshot) {
    return null;
  }

  const feedItems = await getStoredFeedItems(feedType, snapshot.snapshot_date, page);
  const items = await getStoredFeedAnimeCards(feedItems);

  return buildFeedFromSnapshotAndItems(snapshot, items);
}

async function getFeedSnapshot(
  feedType: HomeFeedType,
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

async function getLatestFeedSnapshot(
  feedType: HomeFeedType,
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
  feedType: HomeFeedType,
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
  feedType: HomeFeedType,
  snapshotDate: string,
  page: number,
  feed: PaginatedAnimeCards,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  await supabase
    .from("catalog_feed_items")
    .delete()
    .eq("feed_type", feedType)
    .eq("snapshot_date", snapshotDate)
    .eq("page", page);

  if (!feed.items.length) {
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

  await supabase.from("catalog_feed_items").insert(payload);
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

async function getLocalCatalogFallback(page = 1): Promise<CatalogFeedResult> {
  const localFeed = await getLocalCatalogFeed(page);

  return {
    ...localFeed,
    source: "database",
    notice: null,
  };
}

function getEmptyFeedResult(page = 1): CatalogFeedResult {
  return {
    items: [],
    currentPage: page,
    hasNextPage: false,
    lastPage: 1,
    total: 0,
    source: "database",
    notice: null,
  };
}

async function getFeedRefreshState(
  feedType: HomeFeedType,
): Promise<FeedRefreshStateRecord | null> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("feed_refresh_state")
    .select("*")
    .eq("feed_type", feedType)
    .maybeSingle();

  return (data as FeedRefreshStateRecord | null) ?? null;
}

async function updateFeedRefreshState(
  feedType: HomeFeedType,
  payload: FeedRefreshStateUpdate,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  await supabase.from("feed_refresh_state").upsert(
    {
      feed_type: feedType,
      ...payload,
    },
    { onConflict: "feed_type" },
  );
}

function isDateWithinInterval(value: string | null, intervalMs: number): boolean {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();

  return !Number.isNaN(time) && Date.now() - time < intervalMs;
}

function canAttemptFeedRefresh(state: FeedRefreshStateRecord | null): boolean {
  if (!state?.next_allowed_at) {
    return true;
  }

  const nextAllowedTime = new Date(state.next_allowed_at).getTime();
  return Number.isNaN(nextAllowedTime) || nextAllowedTime <= Date.now();
}

async function markFeedRefreshStarted(feedType: HomeFeedType): Promise<void> {
  await updateFeedRefreshState(feedType, {
    last_attempted_at: new Date().toISOString(),
    status: "refreshing",
    error_message: null,
  });
}

async function markFeedRefreshSuccess(feedType: HomeFeedType): Promise<void> {
  const now = new Date().toISOString();

  await updateFeedRefreshState(feedType, {
    last_attempted_at: now,
    last_succeeded_at: now,
    status: "success",
    error_message: null,
    next_allowed_at: null,
  });
}

async function markFeedRefreshFailure(feedType: HomeFeedType, error: unknown): Promise<void> {
  const now = new Date();

  await updateFeedRefreshState(feedType, {
    last_attempted_at: now.toISOString(),
    status: "failed",
    error_message: error instanceof Error ? error.message : "Feed refresh failed.",
    next_allowed_at: new Date(now.getTime() + FEED_FAILURE_COOLDOWN_MS).toISOString(),
  });
}

async function refreshStoredFeed(
  feedType: HomeFeedType,
  page: number,
): Promise<CatalogFeedResult | null> {
  const snapshotDate = getCatalogSnapshotDate();

  await markFeedRefreshStarted(feedType);

  try {
    const liveFeed =
      feedType === "popular"
        ? await getPopularAnime(page)
        : feedType === "trending"
          ? await getTrendingAnime(page)
          : feedType === "recently-completed"
            ? await getRecentlyCompletedAnime(page)
            : await getNewEpisodesAnime(page);

    await upsertAnimeBasicRecords(liveFeed.items);
    await storeFeedSnapshot(feedType, snapshotDate, page, liveFeed);
    await storeFeedItems(feedType, snapshotDate, page, liveFeed);

    if (feedType === "new-episodes") {
      try {
        await processNewEpisodeFeedNotifications(liveFeed.items);
      } catch (error) {
        console.error("new episode notification processing failed", error);
      }
    }

    if (feedType === "recently-completed") {
      try {
        await processRecentlyCompletedFeedNotifications(liveFeed.items);
      } catch (error) {
        console.error("completed anime notification processing failed", error);
      }
    }

    await markFeedRefreshSuccess(feedType);

    return getResolvedFeed(feedType, snapshotDate, page);
  } catch (error) {
    await markFeedRefreshFailure(feedType, error);
    throw error;
  }
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

async function getSnapshotBackedHomepageFeed(
  feedType: HomeFeedType,
  page = 1,
): Promise<CatalogFeedResult> {
  const snapshotDate = getCatalogSnapshotDate();
  const refreshState = await getFeedRefreshState(feedType);
  const latestFeed = await getResolvedLatestFeed(feedType, page);
  const todaysFeed = await getResolvedFeed(feedType, snapshotDate, page);
  const isFresh = isDateWithinInterval(
    refreshState?.last_succeeded_at ?? null,
    getFeedRefreshIntervalMs(feedType),
  );

  if (feedType === "trending" || feedType === "recently-completed") {
    if (todaysFeed) {
      return todaysFeed;
    }
  } else if (latestFeed && isFresh) {
    return latestFeed;
  }

  const fallbackFeed =
    feedType === "popular" ? await getLocalCatalogFallback(page) : getEmptyFeedResult(page);

  if (!canAttemptFeedRefresh(refreshState)) {
    return latestFeed ?? fallbackFeed;
  }

  try {
    const refreshedFeed = await refreshStoredFeed(feedType, page);

    if (refreshedFeed) {
      return refreshedFeed;
    }

    return latestFeed ?? fallbackFeed;
  } catch (error) {
    if (isAniListTemporarilyUnavailable(error)) {
      return latestFeed ?? fallbackFeed;
    }

    throw error;
  }
}

async function getPopularHomepageFeed(page = 1): Promise<CatalogFeedResult> {
  const feed = await getSnapshotBackedHomepageFeed("popular", page);

  if (feed.items.length) {
    return feed;
  }

  return getLocalCatalogFallback(page);
}

async function getTrendingHomepageFeed(page = 1): Promise<CatalogFeedResult> {
  return getSnapshotBackedHomepageFeed("trending", page);
}

async function getRecentlyCompletedHomepageFeed(
  page = 1,
): Promise<CatalogFeedResult> {
  return getSnapshotBackedHomepageFeed("recently-completed", page);
}

async function getNewEpisodesHomepageFeed(page = 1): Promise<CatalogFeedResult> {
  return getSnapshotBackedHomepageFeed("new-episodes", page);
}

export async function getHomepageFeed(
  feedType: HomeFeedType,
  page = 1,
): Promise<CatalogFeedResult> {
  switch (feedType) {
    case "trending":
      return getTrendingHomepageFeed(page);
    case "recently-completed":
      return getRecentlyCompletedHomepageFeed(page);
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
