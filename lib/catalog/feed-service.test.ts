import { describe, expect, it, vi } from "vitest";

import type { AnimeCard, PaginatedAnimeCards } from "@/lib/anilist";
import type { CatalogCapabilities } from "@/lib/env";

import {
  CatalogFeedUnavailableError,
  resolveHomepageFeed,
  type FeedLeaseDecision,
  type FeedRefreshCoordinator,
  type FeedSnapshotReader,
  type LiveFeedProvider,
} from "./feed-service";
import type { HomeFeedType, StoredFeedCandidate } from "./feed-types";

const NOW = new Date("2026-07-18T12:00:00.000Z");
const TEMPORARY_ERROR = new Error("temporary AniList failure");

function anime(anilistId = 1): AnimeCard {
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

function feed(items: AnimeCard[] = [anime()]): PaginatedAnimeCards {
  return {
    items,
    currentPage: 1,
    hasNextPage: false,
    lastPage: 1,
    total: items.length,
  };
}

function snapshot(
  updatedAt: string,
  items: AnimeCard[] = [anime()],
): StoredFeedCandidate {
  return {
    ...feed(items),
    updatedAt,
    expectedItemCount: items.length,
  };
}

function capabilities(mode: CatalogCapabilities["mode"]): CatalogCapabilities {
  return {
    mode,
    canReadSnapshots: mode !== "live-only",
    canPersistSnapshots: mode === "persistent",
  };
}

function provider(
  fetchFeed: LiveFeedProvider["fetchFeed"],
): LiveFeedProvider {
  return {
    fetchFeed,
    isTemporarilyUnavailable: (error) => error === TEMPORARY_ERROR,
  };
}

function reader(
  stored: StoredFeedCandidate | null,
  local: PaginatedAnimeCards | null = null,
): FeedSnapshotReader {
  return {
    getSnapshotCandidates: vi.fn().mockResolvedValue(stored ? [stored] : []),
    getPopularCatalogFallback: vi.fn().mockResolvedValue(local),
  };
}

async function resolve(options: {
  feedType?: HomeFeedType;
  page?: number;
  mode?: CatalogCapabilities["mode"];
  stored?: StoredFeedCandidate | null;
  local?: PaginatedAnimeCards | null;
  fetchFeed?: LiveFeedProvider["fetchFeed"];
  persistFeed?: (feedType: HomeFeedType, page: number, value: PaginatedAnimeCards) => Promise<void>;
  leaseDecision?: FeedLeaseDecision;
  customCoordinator?: FeedRefreshCoordinator | null;
  customReader?: FeedSnapshotReader | null;
}) {
  const mode = options.mode ?? "live-only";
  const selectedReader =
    options.customReader === undefined
      ? mode === "live-only"
        ? null
        : reader(options.stored ?? null, options.local)
      : options.customReader;
  const selectedCoordinator =
    options.customCoordinator === undefined
      ? mode === "persistent"
        ? {
            tryAcquire: vi.fn().mockResolvedValue(
              options.leaseDecision ?? {
                status: "acquired",
                lease: {
                  token: "lease-token",
                  expiresAt: "2026-07-18T12:03:00.000Z",
                },
              },
            ),
            commit: vi.fn().mockImplementation(
              async (
                feedType: HomeFeedType,
                page: number,
                _lease: unknown,
                value: PaginatedAnimeCards,
              ) => {
                await (options.persistFeed ?? vi.fn().mockResolvedValue(undefined))(
                  feedType,
                  page,
                  value,
                );
              },
            ),
            fail: vi.fn().mockResolvedValue(undefined),
          }
        : null
      : options.customCoordinator;

  return resolveHomepageFeed({
    feedType: options.feedType ?? "popular",
    page: options.page ?? 1,
    capabilities: capabilities(mode),
    reader: selectedReader,
    coordinator: selectedCoordinator,
    liveProvider: provider(options.fetchFeed ?? vi.fn().mockResolvedValue(feed())),
    clock: () => NOW,
    logger: { warn: vi.fn(), error: vi.fn() },
  });
}

describe("resolveHomepageFeed", () => {
  it("returns live AniList data without Supabase", async () => {
    const result = await resolve({ mode: "live-only" });

    expect(result.source).toBe("anilist-live");
    expect(result.freshness).toBe("fresh");
    expect(result.items).toHaveLength(1);
  });

  it("returns a fresh public snapshot without calling AniList", async () => {
    const fetchFeed = vi.fn().mockResolvedValue(feed());
    const result = await resolve({
      mode: "snapshot-readonly",
      stored: snapshot("2026-07-18T11:59:00.000Z"),
      fetchFeed,
    });

    expect(result.source).toBe("snapshot");
    expect(result.freshness).toBe("fresh");
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("returns a stale snapshot when AniList is temporarily unavailable", async () => {
    const result = await resolve({
      mode: "snapshot-readonly",
      stored: snapshot("2026-06-01T00:00:00.000Z"),
      fetchFeed: vi.fn().mockRejectedValue(TEMPORARY_ERROR),
    });

    expect(result.source).toBe("snapshot");
    expect(result.freshness).toBe("stale");
    expect(result.notice?.code).toBe("using-stale-snapshot");
  });

  it("returns live data when persistence fails", async () => {
    const result = await resolve({
      mode: "persistent",
      persistFeed: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });

    expect(result.source).toBe("anilist-live");
    expect(result.notice?.code).toBe("persistence-failed");
  });

  it("returns a stale snapshot without fetching when another worker owns the lease", async () => {
    const fetchFeed = vi.fn().mockResolvedValue(feed());
    const result = await resolve({
      mode: "persistent",
      stored: snapshot("2026-06-01T00:00:00.000Z"),
      leaseDecision: {
        status: "busy",
        expiresAt: "2026-07-18T12:03:00.000Z",
      },
      fetchFeed,
    });

    expect(result.source).toBe("snapshot");
    expect(result.notice?.code).toBe("refresh-in-progress");
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("still returns live data when the lease is busy and no snapshot exists", async () => {
    const commit = vi.fn();
    const result = await resolve({
      mode: "persistent",
      leaseDecision: {
        status: "busy",
        expiresAt: "2026-07-18T12:03:00.000Z",
      },
      customCoordinator: {
        tryAcquire: vi.fn().mockResolvedValue({
          status: "busy",
          expiresAt: "2026-07-18T12:03:00.000Z",
        }),
        commit,
        fail: vi.fn(),
      },
    });

    expect(result.source).toBe("anilist-live");
    expect(commit).not.toHaveBeenCalled();
  });

  it("respects refresh cooldown without calling AniList", async () => {
    const fetchFeed = vi.fn().mockResolvedValue(feed());
    const result = await resolve({
      mode: "persistent",
      stored: snapshot("2026-06-01T00:00:00.000Z"),
      leaseDecision: {
        status: "cooldown",
        nextAllowedAt: "2026-07-18T12:05:00.000Z",
      },
      fetchFeed,
    });

    expect(result.source).toBe("snapshot");
    expect(result.notice?.code).toBe("refresh-cooldown");
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("reports a live request failure through the owned lease", async () => {
    const fail = vi.fn().mockResolvedValue(undefined);
    const coordinator: FeedRefreshCoordinator = {
      tryAcquire: vi.fn().mockResolvedValue({
        status: "acquired",
        lease: {
          token: "page-two-token",
          expiresAt: "2026-07-18T12:03:00.000Z",
        },
      }),
      commit: vi.fn(),
      fail,
    };

    await expect(
      resolve({
        feedType: "trending",
        page: 2,
        mode: "persistent",
        customCoordinator: coordinator,
        fetchFeed: vi.fn().mockRejectedValue(TEMPORARY_ERROR),
      }),
    ).rejects.toBeInstanceOf(CatalogFeedUnavailableError);

    expect(fail).toHaveBeenCalledWith(
      "trending",
      2,
      expect.objectContaining({ token: "page-two-token" }),
      TEMPORARY_ERROR,
    );
  });

  it("continues to AniList when a snapshot read fails", async () => {
    const result = await resolve({
      mode: "snapshot-readonly",
      customReader: {
        getSnapshotCandidates: vi.fn().mockRejectedValue(new Error("read failed")),
        getPopularCatalogFallback: vi.fn().mockResolvedValue(null),
      },
    });

    expect(result.source).toBe("anilist-live");
  });

  it("uses the local catalog only as the popular feed's final fallback", async () => {
    const local = feed([anime(2)]);
    const result = await resolve({
      mode: "snapshot-readonly",
      local,
      fetchFeed: vi.fn().mockRejectedValue(TEMPORARY_ERROR),
    });

    expect(result.source).toBe("local-catalog");
    expect(result.items[0]?.anilistId).toBe(2);
    expect(result.notice?.code).toBe("local-fallback");
  });

  it("rejects invalid snapshots and fetches live data", async () => {
    const duplicateItems = [anime(1), anime(1)];
    const result = await resolve({
      mode: "snapshot-readonly",
      stored: snapshot("2026-07-18T11:59:00.000Z", duplicateItems),
    });

    expect(result.source).toBe("anilist-live");
  });

  it("uses an older valid snapshot when the newest candidate is corrupt", async () => {
    const older = snapshot("2026-06-01T00:00:00.000Z", [anime(3)]);
    const corrupt = snapshot("2026-07-18T11:59:00.000Z", [anime(1), anime(1)]);
    const result = await resolve({
      mode: "snapshot-readonly",
      customReader: {
        getSnapshotCandidates: vi.fn().mockResolvedValue([corrupt, older]),
        getPopularCatalogFallback: vi.fn().mockResolvedValue(null),
      },
      fetchFeed: vi.fn().mockRejectedValue(TEMPORARY_ERROR),
    });

    expect(result.source).toBe("snapshot");
    expect(result.items[0]?.anilistId).toBe(3);
  });

  it("rejects an incomplete snapshot whose metadata claims it has results", async () => {
    const incomplete = {
      ...snapshot("2026-07-18T11:59:00.000Z", []),
      total: 20,
    };
    const result = await resolve({
      feedType: "new-episodes",
      mode: "snapshot-readonly",
      stored: incomplete,
    });

    expect(result.source).toBe("anilist-live");
  });

  it("throws a typed error when no source is usable", async () => {
    await expect(
      resolve({
        feedType: "trending",
        mode: "live-only",
        fetchFeed: vi.fn().mockRejectedValue(TEMPORARY_ERROR),
      }),
    ).rejects.toBeInstanceOf(CatalogFeedUnavailableError);
  });
});
