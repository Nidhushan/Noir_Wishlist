import type { AnimeCard, AnimeDetail, PaginatedAnimeCards, SearchSort } from "@/lib/anilist";
import {
  getAnimeDetail,
  getTrendingAnime,
  isAniListTemporarilyUnavailable,
  searchAnime,
} from "@/lib/anilist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AnimeRecord = Database["public"]["Tables"]["anime"]["Row"];
type AnimeInsert = Database["public"]["Tables"]["anime"]["Insert"];
type AnimeUpdate = Database["public"]["Tables"]["anime"]["Update"];
const CATALOG_PAGE_SIZE = 18;

export interface CatalogFeedResult extends PaginatedAnimeCards {
  source: "database" | "anilist";
  notice: string | null;
}

export interface CatalogDetailResult {
  anime: AnimeDetail | null;
  source: "database" | "anilist";
  notice: string | null;
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

async function getLocalCatalogFeed(page = 1): Promise<PaginatedAnimeCards> {
  const supabase = await createSupabaseServerClient();

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

async function searchLocalCatalog(
  query: string,
  page: number,
  sort: SearchSort,
): Promise<PaginatedAnimeCards> {
  const supabase = await createSupabaseServerClient();

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
