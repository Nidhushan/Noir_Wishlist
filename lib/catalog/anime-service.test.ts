import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnimeCard, AnimeDetail } from "@/lib/anilist";

const mocks = vi.hoisted(() => ({ upsertBatch: vi.fn() }));

vi.mock("./anime-repository", () => ({
  upsertAniListAnimeBatch: mocks.upsertBatch,
}));

import { persistBasicAnimeBatch, persistDetailAnime } from "./anime-service";
import type { CatalogAnimeRecord } from "./anime-write-types";

function anime(anilistId: number): AnimeCard {
  return {
    anilistId,
    title: `Anime ${anilistId}`,
    titleEnglish: null,
    titleRomaji: null,
    titleNative: null,
    coverImage: null,
    bannerImage: null,
    format: "TV",
    status: "RELEASING",
    episodes: 12,
    countryOfOrigin: "JP",
    season: "SUMMER",
    seasonYear: 2026,
    averageScore: 80,
    popularity: 100,
  };
}

function stored(anilistId: number): CatalogAnimeRecord {
  return {
    id: anilistId + 1000,
    anilist_id: anilistId,
    title_display: `Anime ${anilistId}`,
  } as CatalogAnimeRecord;
}

describe("catalog anime service", () => {
  beforeEach(() => {
    mocks.upsertBatch.mockReset();
  });

  it("persists a feed in one basic batch", async () => {
    mocks.upsertBatch.mockResolvedValue({
      status: "committed",
      sourcesLinked: 2,
      records: [
        { anilistId: 20, animeId: 1020, metadataTier: "basic", row: stored(20) },
        { anilistId: 21, animeId: 1021, metadataTier: "basic", row: stored(21) },
      ],
    });

    await expect(persistBasicAnimeBatch([anime(20), anime(21)])).resolves.toHaveLength(2);
    expect(mocks.upsertBatch).toHaveBeenCalledOnce();
    expect(mocks.upsertBatch.mock.calls[0]?.[1]).toBe("basic");
  });

  it("rejects an invalid identity before contacting the database", async () => {
    await expect(persistBasicAnimeBatch([anime(0)])).rejects.toMatchObject({
      code: "invalid_payload",
    });
    expect(mocks.upsertBatch).not.toHaveBeenCalled();
  });

  it("uses the detail merge policy for detail persistence", async () => {
    const detail: AnimeDetail = {
      ...anime(20),
      description: "Description",
      genres: ["Action"],
      siteUrl: "https://anilist.co/anime/20",
    };
    mocks.upsertBatch.mockResolvedValue({
      status: "committed",
      sourcesLinked: 1,
      records: [
        { anilistId: 20, animeId: 1020, metadataTier: "detail", row: stored(20) },
      ],
    });

    await expect(persistDetailAnime(detail)).resolves.toMatchObject({ anilist_id: 20 });
    expect(mocks.upsertBatch.mock.calls[0]?.[1]).toBe("detail");
  });
});
