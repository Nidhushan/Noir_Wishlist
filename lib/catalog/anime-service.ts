import type { AnimeCard, AnimeDetail } from "@/lib/anilist";

import { CatalogAnimeWriteError } from "./anime-errors";
import { toUniqueAniListWriteRecords } from "./anime-mappers";
import { upsertAniListAnimeBatch } from "./anime-repository";
import type { CatalogAnimeRecord, CatalogMetadataTier } from "./anime-write-types";

async function persistAniListAnime(
  items: Array<AnimeCard | AnimeDetail>,
  metadataTier: CatalogMetadataTier,
): Promise<CatalogAnimeRecord[]> {
  const records = toUniqueAniListWriteRecords(items);

  if (records.length !== new Set(items.map((item) => item.anilistId)).size) {
    throw new CatalogAnimeWriteError(
      "invalid_payload",
      "One or more anime records had an invalid identity or title.",
    );
  }

  if (!records.length) {
    return [];
  }

  const result = await upsertAniListAnimeBatch(records, metadataTier);
  return result.records.map((record) => record.row);
}

export async function persistBasicAnimeBatch(
  items: AnimeCard[],
): Promise<CatalogAnimeRecord[]> {
  return persistAniListAnime(items, "basic");
}

export async function persistDetailAnime(
  anime: AnimeDetail,
): Promise<CatalogAnimeRecord> {
  const rows = await persistAniListAnime([anime], "detail");
  const row = rows[0];

  if (!row) {
    throw new CatalogAnimeWriteError(
      "invalid_response",
      "Detail upsert did not return the stored anime.",
    );
  }

  return row;
}
