import { randomUUID } from "node:crypto";

import type { PaginatedAnimeCards } from "@/lib/anilist";
import type { NotificationObservation } from "@/lib/notifications/observation-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import {
  CatalogPersistenceError,
  classifyPersistenceError,
  getPersistenceErrorMessage,
} from "./feed-errors";
import type {
  FeedLeaseDecision,
  FeedRefreshCoordinator,
  FeedRefreshLease,
} from "./feed-service";
import type { HomeFeedType } from "./feed-types";

export interface FeedCoordinatorDependencies {
  ensureAnimeRecords(feed: PaginatedAnimeCards): Promise<void>;
  buildObservations?(
    feedType: HomeFeedType,
    feed: PaginatedAnimeCards,
  ): NotificationObservation[];
  afterCommit?(feedType: HomeFeedType, feed: PaginatedAnimeCards): Promise<void>;
  getSnapshotDate(): string;
  leaseSeconds?: number;
  getAdminClient?: typeof createSupabaseAdminClient;
  createLeaseToken?: () => string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireDateString(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`Lease response did not include a valid ${field}.`);
  }

  return value;
}

function parseLeaseDecision(value: unknown): FeedLeaseDecision {
  const record = asRecord(value);

  if (!record || typeof record.status !== "string") {
    throw new Error("Lease response was invalid.");
  }

  if (record.status === "acquired") {
    if (typeof record.token !== "string") {
      throw new Error("Acquired lease response did not include its token.");
    }

    return {
      status: "acquired",
      lease: {
        token: record.token,
        expiresAt: requireDateString(record.expiresAt, "expiration"),
      },
    };
  }

  if (record.status === "busy") {
    return {
      status: "busy",
      expiresAt: requireDateString(record.expiresAt, "expiration"),
    };
  }

  if (record.status === "cooldown") {
    return {
      status: "cooldown",
      nextAllowedAt: requireDateString(record.nextAllowedAt, "cooldown expiration"),
    };
  }

  throw new Error(`Unknown lease response status: ${record.status}`);
}

function toCommitItems(feed: PaginatedAnimeCards): Json[] {
  return feed.items.map((item, index) => ({
    position: index + 1,
    anilist_id: item.anilistId,
  }));
}

function getFailureDetails(error: unknown): { code: string; message: string } {
  const code =
    error instanceof CatalogPersistenceError
      ? error.code
      : classifyPersistenceError(error);
  const message = getPersistenceErrorMessage(error) || "Feed refresh failed.";

  return {
    code,
    message: message.slice(0, 500),
  };
}

export function createFeedRefreshCoordinator(
  dependencies: FeedCoordinatorDependencies,
): FeedRefreshCoordinator {
  const leaseSeconds = dependencies.leaseSeconds ?? 180;
  const getAdminClient = dependencies.getAdminClient ?? createSupabaseAdminClient;
  const createLeaseToken = dependencies.createLeaseToken ?? randomUUID;

  return {
    async tryAcquire(feedType, page) {
      const supabase = getAdminClient();

      if (!supabase) {
        throw new CatalogPersistenceError(
          "database_unavailable",
          feedType,
          page,
          true,
          "Supabase admin persistence is unavailable.",
        );
      }

      const { data, error } = await supabase.rpc("try_acquire_catalog_feed_lease", {
        p_feed_type: feedType,
        p_page: page,
        p_lease_token: createLeaseToken(),
        p_lease_seconds: leaseSeconds,
      });

      if (error) {
        throw new CatalogPersistenceError(
          "refresh_state_failed",
          feedType,
          page,
          true,
          "Feed refresh lease acquisition failed.",
          { cause: error },
        );
      }

      return parseLeaseDecision(data);
    },

    async commit(feedType, page, lease, feed) {
      const supabase = getAdminClient();

      if (!supabase) {
        throw new CatalogPersistenceError(
          "database_unavailable",
          feedType,
          page,
          true,
          "Supabase admin persistence is unavailable.",
        );
      }

      await dependencies.ensureAnimeRecords(feed);

      const observations = dependencies.buildObservations?.(feedType, feed) ?? [];
      const { error } = await supabase.rpc("commit_catalog_feed_refresh_v2", {
        p_feed_type: feedType,
        p_page: page,
        p_snapshot_date: dependencies.getSnapshotDate(),
        p_total: feed.total,
        p_has_next_page: feed.hasNextPage,
        p_last_page: feed.lastPage,
        p_lease_token: lease.token,
        p_items: toCommitItems(feed),
        p_observations: observations as Json[],
      });

      if (error) {
        const code = classifyPersistenceError(error);
        throw new CatalogPersistenceError(
          code,
          feedType,
          page,
          code !== "invalid_payload",
          "Atomic feed snapshot commit failed.",
          { cause: error },
        );
      }

      if (dependencies.afterCommit) {
        try {
          await dependencies.afterCommit(feedType, feed);
        } catch (error) {
          console.error("catalog.feed.post_commit.failed", {
            feedType,
            page,
            error: error instanceof Error ? error.message : "Unknown post-commit error",
          });
        }
      }
    },

    async fail(feedType, page, lease: FeedRefreshLease, failure) {
      const supabase = getAdminClient();

      if (!supabase) {
        throw new CatalogPersistenceError(
          "database_unavailable",
          feedType,
          page,
          true,
          "Supabase admin persistence is unavailable.",
        );
      }

      const details = getFailureDetails(failure);
      const { data, error } = await supabase.rpc("fail_catalog_feed_refresh", {
        p_feed_type: feedType,
        p_page: page,
        p_lease_token: lease.token,
        p_error_code: details.code,
        p_error_message: details.message,
      });

      if (error) {
        throw new CatalogPersistenceError(
          "refresh_state_failed",
          feedType,
          page,
          true,
          "Feed refresh failure state could not be recorded.",
          { cause: error },
        );
      }

      if (!data) {
        throw new CatalogPersistenceError(
          "lease_not_owned",
          feedType,
          page,
          false,
          "The refresh lease is no longer owned by this worker.",
        );
      }
    },
  };
}
