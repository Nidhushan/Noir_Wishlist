import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
}));

import type { AniListAnimeWriteRecord } from "./anime-write-types";
import { upsertAniListAnimeBatch } from "./anime-repository";

const writeRecord = {
  anilist_id: 20,
  source_url: "https://anilist.co/anime/20",
  title_display: "Anime 20",
  title_normalized: "anime 20",
  title_english: null,
  title_romaji: null,
  title_native: null,
  cover_image: null,
  banner_image: null,
  format: "TV",
  status: "RELEASING",
  episodes: 12,
  country_of_origin: "JP",
  season: "SUMMER",
  season_year: 2026,
  average_score: 80,
  popularity: 100,
  description: null,
  genres: [],
  site_url: null,
} satisfies AniListAnimeWriteRecord;

describe("upsertAniListAnimeBatch", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it("uses the versioned batch RPC and parses identity mappings", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: "committed",
        sourcesLinked: 1,
        records: [
          {
            anilistId: 20,
            animeId: 42,
            metadataTier: "detail",
            row: {
              id: 42,
              anilist_id: 20,
              title_display: "Anime 20",
            },
          },
        ],
      },
      error: null,
    });

    await expect(upsertAniListAnimeBatch([writeRecord], "detail")).resolves.toMatchObject({
      records: [{ anilistId: 20, animeId: 42, metadataTier: "detail" }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("upsert_anilist_anime_batch_v1", {
      p_records: [writeRecord],
      p_metadata_tier: "detail",
    });
  });

  it("rejects incomplete mappings", async () => {
    mocks.rpc.mockResolvedValue({
      data: { status: "committed", sourcesLinked: 0, records: [] },
      error: null,
    });

    await expect(upsertAniListAnimeBatch([writeRecord], "basic")).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
