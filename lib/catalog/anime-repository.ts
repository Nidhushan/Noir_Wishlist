import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import {
  CatalogAnimeWriteError,
  classifyCatalogAnimeWriteError,
} from "./anime-errors";
import type {
  AniListAnimeWriteRecord,
  CatalogAnimeRecord,
  CatalogAnimeUpsertRecord,
  CatalogAnimeUpsertResult,
  CatalogMetadataTier,
} from "./anime-write-types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseUpsertRecord(value: unknown): CatalogAnimeUpsertRecord | null {
  const record = asRecord(value);
  const row = asRecord(record?.row);

  if (
    !record ||
    !row ||
    !Number.isInteger(record.anilistId) ||
    !Number.isInteger(record.animeId) ||
    (record.metadataTier !== "basic" && record.metadataTier !== "detail") ||
    !Number.isInteger(row.id) ||
    row.anilist_id !== record.anilistId ||
    typeof row.title_display !== "string"
  ) {
    return null;
  }

  return {
    anilistId: record.anilistId as number,
    animeId: record.animeId as number,
    metadataTier: record.metadataTier,
    row: row as unknown as CatalogAnimeRecord,
  };
}

function parseUpsertResult(value: unknown, expectedIds: number[]): CatalogAnimeUpsertResult {
  const result = asRecord(value);

  if (
    !result ||
    result.status !== "committed" ||
    !Array.isArray(result.records) ||
    !Number.isInteger(result.sourcesLinked) ||
    (result.sourcesLinked as number) < 0
  ) {
    throw new CatalogAnimeWriteError(
      "invalid_response",
      "Catalog anime upsert returned an invalid response.",
    );
  }

  const records = result.records
    .map(parseUpsertRecord)
    .filter((record): record is CatalogAnimeUpsertRecord => record !== null);
  const returnedIds = new Set(records.map((record) => record.anilistId));

  if (
    records.length !== expectedIds.length ||
    expectedIds.some((anilistId) => !returnedIds.has(anilistId))
  ) {
    throw new CatalogAnimeWriteError(
      "invalid_response",
      "Catalog anime upsert did not return every requested identity.",
    );
  }

  return {
    status: "committed",
    records,
    sourcesLinked: result.sourcesLinked as number,
  };
}

export async function upsertAniListAnimeBatch(
  records: AniListAnimeWriteRecord[],
  metadataTier: CatalogMetadataTier,
): Promise<CatalogAnimeUpsertResult> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    throw new CatalogAnimeWriteError(
      "database_unavailable",
      "Persistent anime catalog writes are unavailable.",
    );
  }

  const { data, error } = await supabase.rpc("upsert_anilist_anime_batch_v1", {
    p_records: records as Json[],
    p_metadata_tier: metadataTier,
  });

  if (error) {
    throw new CatalogAnimeWriteError(
      classifyCatalogAnimeWriteError(error),
      "Catalog anime batch upsert failed.",
      { cause: error },
    );
  }

  return parseUpsertResult(
    data,
    records.map((record) => record.anilist_id),
  );
}
