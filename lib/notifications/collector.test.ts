import { describe, expect, it, vi } from "vitest";

import type { TrackedAnimeNotificationState } from "@/lib/anilist";

import { createNotificationCollector } from "./collector";

function createDatabase(options: { enqueueQueued?: number } = {}) {
  const updates: unknown[] = [];
  const rpc = vi.fn(async (name: string) => {
    if (name === "list_notification_tracking_targets_v1") {
      return {
        data: [
          { anime_id: 10, anilist_id: 100 },
          { anime_id: 20, anilist_id: 200 },
        ],
        error: null,
      };
    }

    if (name === "enqueue_notification_observation_batch_v1") {
      return {
        data: {
          status: "accepted",
          observationsAccepted: 1,
          observationsQueued: options.enqueueQueued ?? 1,
        },
        error: null,
      };
    }

    throw new Error(`Unexpected RPC: ${name}`);
  });
  const from = vi.fn(() => ({
    insert: () => ({
      select: () => ({
        single: async () => ({ data: { id: 7 }, error: null }),
      }),
    }),
    update: (value: unknown) => ({
      eq: async () => {
        updates.push(value);
        return { error: null };
      },
    }),
  }));

  return { client: { from, rpc }, rpc, updates };
}

describe("collectTrackedAnimeNotifications", () => {
  it("scans distinct targets, queues observations, and records diagnostics", async () => {
    const database = createDatabase();
    const fetchStates = vi.fn(async (): Promise<TrackedAnimeNotificationState[]> => [
      {
        anilistId: 100,
        status: "RELEASING",
        totalEpisodes: 12,
        completedAt: null,
        nextEpisodeNumber: 4,
        nextEpisodeAt: "2026-07-21T00:00:00.000Z",
      },
      {
        anilistId: 200,
        status: "NOT_YET_RELEASED",
        totalEpisodes: 12,
        completedAt: null,
        nextEpisodeNumber: 1,
        nextEpisodeAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    const collector = createNotificationCollector({
      getAdminClient: () => database.client as never,
      fetchStates,
      buildObservations: (states) => [
        {
          observation_type: "new_episode",
          anilist_id: states[0].anilistId,
          episode_number: 3,
          event_occurred_at: "2026-07-20T00:00:00.000Z",
          payload: {},
        },
      ],
      clock: () => new Date("2026-07-20T12:00:00.000Z"),
    });

    await expect(collector()).resolves.toEqual({
      status: "collected",
      runId: 7,
      targets: 2,
      fetched: 2,
      observations: 1,
      queued: 1,
      batches: 1,
    });
    expect(fetchStates).toHaveBeenCalledWith([100, 200]);
    expect(database.rpc).toHaveBeenCalledWith(
      "enqueue_notification_observation_batch_v1",
      expect.objectContaining({ p_source_run_id: 7 }),
    );
    expect(database.updates).toContainEqual(
      expect.objectContaining({ status: "succeeded", inserted_count: 1 }),
    );
  });

  it("records failed runs when upstream collection fails", async () => {
    const database = createDatabase();
    const collector = createNotificationCollector({
      getAdminClient: () => database.client as never,
      fetchStates: async () => {
        throw new Error("AniList unavailable");
      },
      buildObservations: () => [],
      clock: () => new Date("2026-07-20T12:00:00.000Z"),
    });

    await expect(collector()).rejects.toThrow("AniList unavailable");
    expect(database.updates).toContainEqual(
      expect.objectContaining({
        status: "failed",
        error_message: "AniList unavailable",
      }),
    );
  });
});
