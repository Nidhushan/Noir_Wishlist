import type { AnimeCard, AnimeDetail } from "@/lib/anilist";

import type { AniListAnimeWriteRecord } from "./anime-write-types";

export function normalizeTitleKey(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\p{Letter}\p{Number}_\s]/gu, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toAniListAnimeWriteRecord(
  anime: AnimeCard | AnimeDetail,
): AniListAnimeWriteRecord {
  const detail = "description" in anime ? anime : null;

  return {
    anilist_id: anime.anilistId,
    source_url: `https://anilist.co/anime/${anime.anilistId}`,
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
    description: detail?.description ?? null,
    genres: detail?.genres ?? [],
    site_url: detail?.siteUrl ?? null,
  };
}

export function toUniqueAniListWriteRecords(
  anime: Array<AnimeCard | AnimeDetail>,
): AniListAnimeWriteRecord[] {
  const records = new Map<number, AniListAnimeWriteRecord>();

  for (const item of anime) {
    if (!Number.isInteger(item.anilistId) || item.anilistId <= 0) {
      continue;
    }

    const record = toAniListAnimeWriteRecord(item);

    if (!record.title_normalized) {
      continue;
    }

    records.set(item.anilistId, record);
  }

  return Array.from(records.values());
}
