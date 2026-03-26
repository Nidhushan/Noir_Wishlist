import type { AnimeCard, AnimeDetail } from "@/lib/anilist";
import { getAnimeDetail } from "@/lib/anilist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AnimeRecord = Database["public"]["Tables"]["anime"]["Row"];
type AnimeInsert = Database["public"]["Tables"]["anime"]["Insert"];
type AnimeUpdate = Database["public"]["Tables"]["anime"]["Update"];

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
