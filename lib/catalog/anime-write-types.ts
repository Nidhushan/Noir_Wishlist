import type { Database, Json } from "@/lib/supabase/database.types";

export type CatalogAnimeRecord = Database["public"]["Tables"]["anime"]["Row"];
export type CatalogMetadataTier = "basic" | "detail";

export type AniListAnimeWriteRecord = {
  anilist_id: number;
  source_url: string;
  title_display: string;
  title_normalized: string;
  title_english: string | null;
  title_romaji: string | null;
  title_native: string | null;
  cover_image: string | null;
  banner_image: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  country_of_origin: string | null;
  season: string | null;
  season_year: number | null;
  average_score: number | null;
  popularity: number | null;
  description: string | null;
  genres: string[];
  site_url: string | null;
} & Record<string, Json | undefined>;

export interface CatalogAnimeUpsertRecord {
  anilistId: number;
  animeId: number;
  metadataTier: CatalogMetadataTier;
  row: CatalogAnimeRecord;
}

export interface CatalogAnimeUpsertResult {
  status: "committed";
  records: CatalogAnimeUpsertRecord[];
  sourcesLinked: number;
}
