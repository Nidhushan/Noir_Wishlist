import { describe, expect, it } from "vitest";

import type { AnimeCard, AnimeDetail } from "@/lib/anilist";

import {
  normalizeTitleKey,
  toAniListAnimeWriteRecord,
  toUniqueAniListWriteRecords,
} from "./anime-mappers";

function anime(anilistId: number): AnimeCard {
  return {
    anilistId,
    title: "Fate/stay night: Unlimited_Blade Works!",
    titleEnglish: null,
    titleRomaji: "Fate/stay night",
    titleNative: null,
    coverImage: null,
    bannerImage: null,
    format: "TV",
    status: "FINISHED",
    episodes: 12,
    countryOfOrigin: "JP",
    season: "FALL",
    seasonYear: 2014,
    averageScore: 80,
    popularity: 100,
  };
}

describe("catalog anime mappers", () => {
  it("normalizes title identity keys consistently", () => {
    expect(normalizeTitleKey("  Café_Racer!! ")).toBe("cafe racer");
    expect(normalizeTitleKey("進撃の巨人")).toBe("進撃の巨人");
  });

  it("keeps detail-only fields out of a basic record", () => {
    expect(toAniListAnimeWriteRecord(anime(20))).toMatchObject({
      anilist_id: 20,
      description: null,
      genres: [],
      site_url: null,
    });
  });

  it("maps detail fields for authoritative detail writes", () => {
    const detail: AnimeDetail = {
      ...anime(20),
      description: "Description",
      genres: ["Action"],
      siteUrl: "https://anilist.co/anime/20",
    };

    expect(toAniListAnimeWriteRecord(detail)).toMatchObject({
      description: "Description",
      genres: ["Action"],
      site_url: "https://anilist.co/anime/20",
    });
  });

  it("deduplicates valid AniList identities and rejects invalid mapping candidates", () => {
    expect(toUniqueAniListWriteRecords([anime(20), anime(20), anime(0)])).toHaveLength(1);
  });
});
