import {
  getTrackedAnimeNotificationStates,
  type TrackedAnimeNotificationState,
} from "@/lib/anilist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { buildTrackedNotificationObservations } from "./observation-builder";
import type { NotificationObservation } from "./observation-types";

const TARGET_PAGE_SIZE = 500;
const ANILIST_BATCH_SIZE = 50;

interface TrackingTarget {
  anime_id: number;
  anilist_id: number;
}

interface EnqueueResult {
  status: "accepted";
  observationsAccepted: number;
  observationsQueued: number;
}

export interface NotificationCollectionResult {
  status: "collected";
  runId: number;
  targets: number;
  fetched: number;
  observations: number;
  queued: number;
  batches: number;
}

export interface NotificationCollectorDependencies {
  getAdminClient: typeof createSupabaseAdminClient;
  fetchStates(ids: number[]): Promise<TrackedAnimeNotificationState[]>;
  buildObservations(
    states: TrackedAnimeNotificationState[],
    observedAt?: Date,
  ): NotificationObservation[];
  clock(): Date;
}

function asNonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function parseTargets(value: unknown): TrackingTarget[] {
  if (!Array.isArray(value)) {
    throw new Error("Notification tracking target response was invalid.");
  }

  return value.map((target) => {
    if (!target || typeof target !== "object") {
      throw new Error("Notification tracking target response was invalid.");
    }

    const animeId = (target as Record<string, unknown>).anime_id;
    const anilistId = (target as Record<string, unknown>).anilist_id;

    if (
      !Number.isInteger(animeId) ||
      (animeId as number) <= 0 ||
      !Number.isInteger(anilistId) ||
      (anilistId as number) <= 0
    ) {
      throw new Error("Notification tracking target response was invalid.");
    }

    return { anime_id: animeId as number, anilist_id: anilistId as number };
  });
}

function parseEnqueueResult(value: unknown): EnqueueResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Notification enqueue response was invalid.");
  }

  const record = value as Record<string, unknown>;
  const accepted = asNonNegativeInteger(record.observationsAccepted);
  const queued = asNonNegativeInteger(record.observationsQueued);

  if (record.status !== "accepted" || accepted === null || queued === null) {
    throw new Error("Notification enqueue response was invalid.");
  }

  return {
    status: "accepted",
    observationsAccepted: accepted,
    observationsQueued: queued,
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export function createNotificationCollector(
  dependencies: NotificationCollectorDependencies,
) {
  return async function collectTrackedAnimeNotifications(): Promise<NotificationCollectionResult> {
    const supabase = dependencies.getAdminClient();

    if (!supabase) {
      throw new Error("Persistent notification collection is unavailable.");
    }

    const startedAt = dependencies.clock();
    const { data: run, error: runError } = await supabase
      .from("sync_runs")
      .insert({
        job_type: "notification_collection",
        status: "running",
        scope: { collector: "tracked-anime", version: 1 },
      })
      .select("id")
      .single();

    if (runError || !run) {
      throw new Error("Notification collection run could not be recorded.", {
        cause: runError ?? undefined,
      });
    }

    const runId = run.id;
    let targetCount = 0;
    let fetchedCount = 0;
    let observationCount = 0;
    let queuedCount = 0;
    let batchCount = 0;

    try {
      let afterAnimeId = 0;

      while (true) {
        const { data, error } = await supabase.rpc(
          "list_notification_tracking_targets_v1",
          {
            p_after_anime_id: afterAnimeId,
            p_limit: TARGET_PAGE_SIZE,
          },
        );

        if (error) {
          throw new Error("Notification tracking targets could not be loaded.", {
            cause: error,
          });
        }

        const targets = parseTargets(data);
        targetCount += targets.length;

        for (const batch of chunks(targets, ANILIST_BATCH_SIZE)) {
          const states = await dependencies.fetchStates(
            batch.map((target) => target.anilist_id),
          );
          const observations = dependencies.buildObservations(
            states,
            dependencies.clock(),
          );

          batchCount += 1;
          fetchedCount += states.length;
          observationCount += observations.length;

          if (observations.length > 0) {
            const { data: enqueueData, error: enqueueError } = await supabase.rpc(
              "enqueue_notification_observation_batch_v1",
              {
                p_observations: observations as Json[],
                p_source_run_id: runId,
              },
            );

            if (enqueueError) {
              throw new Error("Notification observations could not be queued.", {
                cause: enqueueError,
              });
            }

            queuedCount += parseEnqueueResult(enqueueData).observationsQueued;
          }
        }

        if (targets.length < TARGET_PAGE_SIZE) {
          break;
        }

        afterAnimeId = targets[targets.length - 1].anime_id;
      }

      const result: NotificationCollectionResult = {
        status: "collected",
        runId,
        targets: targetCount,
        fetched: fetchedCount,
        observations: observationCount,
        queued: queuedCount,
        batches: batchCount,
      };
      const { error: finishError } = await supabase
        .from("sync_runs")
        .update({
          status: "succeeded",
          processed_count: fetchedCount,
          inserted_count: queuedCount,
          updated_count: observationCount,
          scope: {
            collector: "tracked-anime",
            version: 1,
            targets: targetCount,
            fetched: fetchedCount,
            observations: observationCount,
            queued: queuedCount,
            batches: batchCount,
            durationMs: dependencies.clock().getTime() - startedAt.getTime(),
          },
          finished_at: dependencies.clock().toISOString(),
        })
        .eq("id", runId);

      if (finishError) {
        throw new Error("Notification collection result could not be recorded.", {
          cause: finishError,
        });
      }

      return result;
    } catch (error) {
      await supabase
        .from("sync_runs")
        .update({
          status: "failed",
          processed_count: fetchedCount,
          inserted_count: queuedCount,
          updated_count: observationCount,
          error_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
          scope: {
            collector: "tracked-anime",
            version: 1,
            targets: targetCount,
            fetched: fetchedCount,
            observations: observationCount,
            queued: queuedCount,
            batches: batchCount,
          },
          finished_at: dependencies.clock().toISOString(),
        })
        .eq("id", runId);

      throw error;
    }
  };
}

export const collectTrackedAnimeNotifications = createNotificationCollector({
  getAdminClient: createSupabaseAdminClient,
  fetchStates: getTrackedAnimeNotificationStates,
  buildObservations: buildTrackedNotificationObservations,
  clock: () => new Date(),
});
