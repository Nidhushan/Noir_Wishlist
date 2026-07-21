import { describe, expect, it } from "vitest";

import type { AnimeCard, TrackedAnimeNotificationState } from "@/lib/anilist";

import {
  buildNotificationObservations,
  buildTrackedNotificationObservations,
} from "./observation-builder";

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

describe("buildNotificationObservations", () => {
  it("normalizes and deduplicates episode observations", () => {
    const item = {
      ...anime(20),
      latestEpisodeNumber: 4,
      latestEpisodeAt: "2026-07-18T12:00:00Z",
    };

    expect(
      buildNotificationObservations("new-episodes", [item, item], new Date("2026-07-19")),
    ).toEqual([
      {
        observation_type: "new_episode",
        anilist_id: 20,
        episode_number: 4,
        event_occurred_at: "2026-07-18T12:00:00.000Z",
        payload: { episodeNumber: 4 },
      },
    ]);
  });

  it("uses the observation time for an invalid upstream timestamp", () => {
    const item = {
      ...anime(20),
      latestEpisodeNumber: 4,
      latestEpisodeAt: "not-a-date",
    };

    expect(
      buildNotificationObservations(
        "new-episodes",
        [item],
        new Date("2026-07-19T01:02:03.000Z"),
      )[0]?.event_occurred_at,
    ).toBe("2026-07-19T01:02:03.000Z");
  });

  it("builds completion observations and ignores non-notification feeds", () => {
    const item = { ...anime(21), completedAt: "2026-07-17T00:00:00Z" };

    expect(buildNotificationObservations("recently-completed", [item])).toEqual([
      {
        observation_type: "anime_completed",
        anilist_id: 21,
        episode_number: null,
        event_occurred_at: "2026-07-17T00:00:00.000Z",
        payload: {},
      },
    ]);
    expect(buildNotificationObservations("popular", [item])).toEqual([]);
  });

  it("ignores invalid IDs and episode numbers", () => {
    expect(
      buildNotificationObservations("new-episodes", [
        { ...anime(0), latestEpisodeNumber: 2 },
        { ...anime(20), latestEpisodeNumber: 0 },
        { ...anime(21), latestEpisodeNumber: null },
      ]),
    ).toEqual([]);
  });
});

describe("buildTrackedNotificationObservations", () => {
  const observedAt = new Date("2026-07-20T12:00:00.000Z");

  function state(
    overrides: Partial<TrackedAnimeNotificationState> = {},
  ): TrackedAnimeNotificationState {
    return {
      anilistId: 20,
      status: "RELEASING",
      totalEpisodes: 12,
      completedAt: null,
      nextEpisodeNumber: 5,
      nextEpisodeAt: "2026-07-21T12:00:00.000Z",
      ...overrides,
    };
  }

  it("derives the latest aired episode from the next scheduled episode", () => {
    expect(buildTrackedNotificationObservations([state()], observedAt)[0]).toMatchObject({
      observation_type: "new_episode",
      anilist_id: 20,
      episode_number: 4,
      event_occurred_at: observedAt.toISOString(),
    });
  });

  it("treats a next-airing timestamp in the past as already aired", () => {
    expect(
      buildTrackedNotificationObservations(
        [state({ nextEpisodeAt: "2026-07-20T11:00:00.000Z" })],
        observedAt,
      )[0],
    ).toMatchObject({
      episode_number: 5,
      event_occurred_at: "2026-07-20T11:00:00.000Z",
    });
  });

  it("emits completion state and avoids pre-premiere episode zero", () => {
    const observations = buildTrackedNotificationObservations(
      [
        state({
          status: "FINISHED",
          completedAt: "2026-07-19T12:00:00.000Z",
          nextEpisodeNumber: null,
          nextEpisodeAt: null,
        }),
        state({ anilistId: 21, status: "NOT_YET_RELEASED", nextEpisodeNumber: 1 }),
      ],
      observedAt,
    );

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      observation_type: "anime_completed",
      anilist_id: 20,
      episode_number: null,
    });
  });
});
