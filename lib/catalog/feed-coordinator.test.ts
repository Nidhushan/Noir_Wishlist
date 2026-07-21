import { describe, expect, it, vi } from "vitest";

import type { AnimeCard, PaginatedAnimeCards } from "@/lib/anilist";
import { buildNotificationObservations } from "@/lib/notifications/observation-builder";

import {
  createFeedRefreshCoordinator,
  type FeedCoordinatorDependencies,
} from "./feed-coordinator";
import { CatalogPersistenceError } from "./feed-errors";

function anime(anilistId = 20): AnimeCard {
  return {
    anilistId,
    title: `Anime ${anilistId}`,
    titleEnglish: null,
    titleRomaji: `Anime ${anilistId}`,
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

function feed(): PaginatedAnimeCards {
  return {
    items: [anime(20), anime(21)],
    currentPage: 2,
    hasNextPage: true,
    lastPage: 10,
    total: 200,
  };
}

function createDependencies(
  rpc: ReturnType<typeof vi.fn>,
  overrides: Partial<FeedCoordinatorDependencies> = {},
): FeedCoordinatorDependencies {
  return {
    ensureAnimeRecords: vi.fn().mockResolvedValue(undefined),
    getSnapshotDate: () => "2026-07-18",
    leaseSeconds: 180,
    createLeaseToken: () => "11111111-1111-4111-8111-111111111111",
    getAdminClient: (() => ({ rpc })) as unknown as NonNullable<
      FeedCoordinatorDependencies["getAdminClient"]
    >,
    ...overrides,
  };
}

describe("createFeedRefreshCoordinator", () => {
  it("acquires a page-scoped lease with a generated token", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "acquired",
        token: "11111111-1111-4111-8111-111111111111",
        expiresAt: "2026-07-18T12:03:00.000Z",
      },
      error: null,
    });
    const coordinator = createFeedRefreshCoordinator(createDependencies(rpc));

    const result = await coordinator.tryAcquire("popular", 2);

    expect(result).toEqual({
      status: "acquired",
      lease: {
        token: "11111111-1111-4111-8111-111111111111",
        expiresAt: "2026-07-18T12:03:00.000Z",
      },
    });
    expect(rpc).toHaveBeenCalledWith("try_acquire_catalog_feed_lease", {
      p_feed_type: "popular",
      p_page: 2,
      p_lease_token: "11111111-1111-4111-8111-111111111111",
      p_lease_seconds: 180,
    });
  });

  it("commits ordered AniList IDs only after catalog records exist", async () => {
    const callOrder: string[] = [];
    const rpc = vi.fn().mockImplementation(async (name: string) => {
      callOrder.push(name);
      return { data: { status: "committed" }, error: null };
    });
    const ensureAnimeRecords = vi.fn().mockImplementation(async () => {
      callOrder.push("ensure-anime");
    });
    const afterCommit = vi.fn().mockImplementation(async () => {
      callOrder.push("after-commit");
    });
    const coordinator = createFeedRefreshCoordinator(
      createDependencies(rpc, { ensureAnimeRecords, afterCommit }),
    );

    await coordinator.commit(
      "trending",
      2,
      {
        token: "11111111-1111-4111-8111-111111111111",
        expiresAt: "2026-07-18T12:03:00.000Z",
      },
      feed(),
    );

    expect(callOrder).toEqual([
      "ensure-anime",
      "commit_catalog_feed_refresh_v2",
      "after-commit",
    ]);
    expect(rpc).toHaveBeenCalledWith(
      "commit_catalog_feed_refresh_v2",
      expect.objectContaining({
        p_feed_type: "trending",
        p_page: 2,
        p_snapshot_date: "2026-07-18",
        p_items: [
          { position: 1, anilist_id: 20 },
          { position: 2, anilist_id: 21 },
        ],
        p_observations: [],
      }),
    );
  });

  it("includes notification observations in the atomic commit payload", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { status: "committed", notificationJobId: 42 },
      error: null,
    });
    const notificationFeed = feed();
    notificationFeed.items[0] = {
      ...notificationFeed.items[0],
      latestEpisodeNumber: 6,
      latestEpisodeAt: "2026-07-18T12:00:00.000Z",
    };
    const coordinator = createFeedRefreshCoordinator(
      createDependencies(rpc, {
        buildObservations: (feedType, value) =>
          buildNotificationObservations(
            feedType,
            value.items,
            new Date("2026-07-18T12:01:00.000Z"),
          ),
      }),
    );

    await coordinator.commit(
      "new-episodes",
      2,
      {
        token: "11111111-1111-4111-8111-111111111111",
        expiresAt: "2026-07-18T12:03:00.000Z",
      },
      notificationFeed,
    );

    expect(rpc).toHaveBeenCalledWith(
      "commit_catalog_feed_refresh_v2",
      expect.objectContaining({
        p_items: [
          { position: 1, anilist_id: 20 },
          { position: 2, anilist_id: 21 },
        ],
        p_observations: [
          {
            observation_type: "new_episode",
            anilist_id: 20,
            episode_number: 6,
            event_occurred_at: "2026-07-18T12:00:00.000Z",
            payload: { episodeNumber: 6 },
          },
        ],
      }),
    );
  });

  it("does not run post-commit work after an atomic commit failure", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "feed refresh lease is not owned by this worker" },
    });
    const afterCommit = vi.fn();
    const coordinator = createFeedRefreshCoordinator(
      createDependencies(rpc, { afterCommit }),
    );

    await expect(
      coordinator.commit(
        "popular",
        1,
        {
          token: "11111111-1111-4111-8111-111111111111",
          expiresAt: "2026-07-18T12:03:00.000Z",
        },
        feed(),
      ),
    ).rejects.toMatchObject({
      code: "lease_not_owned",
    });
    expect(afterCommit).not.toHaveBeenCalled();
  });

  it("keeps a committed snapshot successful when immediate processing fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { status: "committed", observationsQueued: 1 },
      error: null,
    });
    const afterCommit = vi.fn().mockRejectedValue(new Error("worker unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const coordinator = createFeedRefreshCoordinator(
      createDependencies(rpc, { afterCommit }),
    );

    await expect(
      coordinator.commit(
        "new-episodes",
        1,
        {
          token: "11111111-1111-4111-8111-111111111111",
          expiresAt: "2026-07-18T12:03:00.000Z",
        },
        feed(),
      ),
    ).resolves.toBeUndefined();

    expect(afterCommit).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "catalog.feed.post_commit.failed",
      expect.objectContaining({ feedType: "new-episodes", page: 1 }),
    );
    consoleError.mockRestore();
  });

  it("rejects failure updates from a worker that lost its lease", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const coordinator = createFeedRefreshCoordinator(createDependencies(rpc));

    await expect(
      coordinator.fail(
        "new-episodes",
        3,
        {
          token: "11111111-1111-4111-8111-111111111111",
          expiresAt: "2026-07-18T12:03:00.000Z",
        },
        new Error("upstream timeout"),
      ),
    ).rejects.toBeInstanceOf(CatalogPersistenceError);
  });
});
