import type { PaginatedAnimeCards } from "@/lib/anilist";
import type { CatalogCapabilities } from "@/lib/env";

import type {
  CatalogFeedResult,
  FeedNotice,
  HomeFeedType,
  StoredFeedCandidate,
} from "./feed-types";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface FeedPolicy {
  freshnessMs: number;
  allowLocalCatalogFallback: boolean;
  allowEmptySnapshot: boolean;
}

export const FEED_POLICIES: Record<HomeFeedType, FeedPolicy> = {
  popular: {
    freshnessMs: 7 * DAY_MS,
    allowLocalCatalogFallback: true,
    allowEmptySnapshot: false,
  },
  trending: {
    freshnessMs: DAY_MS,
    allowLocalCatalogFallback: false,
    allowEmptySnapshot: false,
  },
  "recently-completed": {
    freshnessMs: DAY_MS,
    allowLocalCatalogFallback: false,
    allowEmptySnapshot: true,
  },
  "new-episodes": {
    freshnessMs: 10 * MINUTE_MS,
    allowLocalCatalogFallback: false,
    allowEmptySnapshot: true,
  },
};

export interface FeedSnapshotReader {
  getSnapshotCandidates(
    feedType: HomeFeedType,
    page: number,
  ): Promise<StoredFeedCandidate[]>;
  getPopularCatalogFallback(page: number): Promise<PaginatedAnimeCards | null>;
}

export interface FeedRefreshLease {
  token: string;
  expiresAt: string;
}

export type FeedLeaseDecision =
  | { status: "acquired"; lease: FeedRefreshLease }
  | { status: "busy"; expiresAt: string }
  | { status: "cooldown"; nextAllowedAt: string };

export interface FeedRefreshCoordinator {
  tryAcquire(feedType: HomeFeedType, page: number): Promise<FeedLeaseDecision>;
  commit(
    feedType: HomeFeedType,
    page: number,
    lease: FeedRefreshLease,
    feed: PaginatedAnimeCards,
  ): Promise<void>;
  fail(
    feedType: HomeFeedType,
    page: number,
    lease: FeedRefreshLease,
    error: unknown,
  ): Promise<void>;
}

export interface LiveFeedProvider {
  fetchFeed(feedType: HomeFeedType, page: number): Promise<PaginatedAnimeCards>;
  isTemporarilyUnavailable(error: unknown): boolean;
}

export interface CatalogLogger {
  warn(event: string, context: Record<string, unknown>): void;
  error(event: string, context: Record<string, unknown>): void;
}

export interface ResolveHomepageFeedOptions {
  feedType: HomeFeedType;
  page: number;
  capabilities: CatalogCapabilities;
  reader: FeedSnapshotReader | null;
  coordinator: FeedRefreshCoordinator | null;
  liveProvider: LiveFeedProvider;
  clock?: () => Date;
  logger?: CatalogLogger;
}

const defaultLogger: CatalogLogger = {
  warn(event, context) {
    console.warn(event, context);
  },
  error(event, context) {
    console.error(event, context);
  },
};

export class CatalogFeedUnavailableError extends Error {
  constructor(
    readonly feedType: HomeFeedType,
    readonly page: number,
    options?: { cause?: unknown },
  ) {
    super(`The ${feedType.replaceAll("-", " ")} feed is temporarily unavailable.`, options);
    this.name = "CatalogFeedUnavailableError";
  }
}

export function isStoredFeedValid(
  feed: StoredFeedCandidate,
  policy: FeedPolicy,
): boolean {
  if (
    !Number.isInteger(feed.currentPage) ||
    feed.currentPage < 1 ||
    !Number.isInteger(feed.lastPage) ||
    feed.lastPage < 1 ||
    !Number.isFinite(feed.total) ||
    feed.total < 0 ||
    !Number.isInteger(feed.expectedItemCount) ||
    feed.expectedItemCount < 0 ||
    feed.expectedItemCount !== feed.items.length ||
    Number.isNaN(new Date(feed.updatedAt).getTime())
  ) {
    return false;
  }

  if (
    feed.items.length === 0 &&
    (!policy.allowEmptySnapshot || feed.total > 0)
  ) {
    return false;
  }

  const ids = feed.items.map((item) => item.anilistId);

  return (
    ids.every((id) => Number.isInteger(id) && id > 0) &&
    new Set(ids).size === ids.length
  );
}

function isSnapshotFresh(
  snapshot: StoredFeedCandidate,
  policy: FeedPolicy,
  now: Date,
): boolean {
  const updatedAt = new Date(snapshot.updatedAt).getTime();
  const age = now.getTime() - updatedAt;
  return age >= 0 && age < policy.freshnessMs;
}

function toResult(
  feed: PaginatedAnimeCards,
  options: Pick<CatalogFeedResult, "source" | "freshness" | "notice" | "sourceUpdatedAt">,
  now: Date,
): CatalogFeedResult {
  return {
    ...feed,
    ...options,
    resolvedAt: now.toISOString(),
  };
}

function staleSnapshotNotice(): FeedNotice {
  return {
    code: "using-stale-snapshot",
    message: "AniList is temporarily unavailable. Noir is showing the latest stored feed.",
  };
}

async function failLeaseSafely(
  options: ResolveHomepageFeedOptions,
  lease: FeedRefreshLease,
  error: unknown,
  logger: CatalogLogger,
): Promise<void> {
  if (!options.coordinator) {
    return;
  }

  try {
    await options.coordinator.fail(options.feedType, options.page, lease, error);
  } catch (failureError) {
    logger.error("catalog.feed.lease.failure_report_failed", {
      feedType: options.feedType,
      page: options.page,
      runtimeMode: options.capabilities.mode,
      error:
        failureError instanceof Error
          ? failureError.message
          : "Unknown lease failure reporting error",
    });
  }
}

async function resolveStoredFallback(
  options: ResolveHomepageFeedOptions,
  validSnapshot: StoredFeedCandidate | null,
  notice: FeedNotice,
  now: Date,
  logger: CatalogLogger,
): Promise<CatalogFeedResult> {
  if (validSnapshot) {
    return toResult(
      validSnapshot,
      {
        source: "snapshot",
        freshness: "stale",
        notice,
        sourceUpdatedAt: validSnapshot.updatedAt,
      },
      now,
    );
  }

  const policy = FEED_POLICIES[options.feedType];

  if (policy.allowLocalCatalogFallback && options.reader) {
    try {
      const fallback = await options.reader.getPopularCatalogFallback(options.page);

      if (fallback?.items.length) {
        return toResult(
          fallback,
          {
            source: "local-catalog",
            freshness: "stale",
            notice: {
              code: "local-fallback",
              message:
                "AniList is temporarily unavailable. Noir is showing popularity-ranked catalog titles.",
            },
            sourceUpdatedAt: null,
          },
          now,
        );
      }
    } catch (fallbackError) {
      logger.warn("catalog.feed.local_fallback.failed", {
        feedType: options.feedType,
        page: options.page,
        runtimeMode: options.capabilities.mode,
        error:
          fallbackError instanceof Error
            ? fallbackError.message
            : "Unknown local fallback error",
      });
    }
  }

  throw new CatalogFeedUnavailableError(options.feedType, options.page);
}

async function readSnapshotCandidatesSafely(
  options: ResolveHomepageFeedOptions,
  logger: CatalogLogger,
): Promise<StoredFeedCandidate[]> {
  if (!options.capabilities.canReadSnapshots || !options.reader) {
    return [];
  }

  try {
    return await options.reader.getSnapshotCandidates(options.feedType, options.page);
  } catch (error) {
    logger.warn("catalog.feed.snapshot.read_failed", {
      feedType: options.feedType,
      page: options.page,
      runtimeMode: options.capabilities.mode,
      error: error instanceof Error ? error.message : "Unknown snapshot read error",
    });
    return [];
  }
}

export async function resolveHomepageFeed(
  options: ResolveHomepageFeedOptions,
): Promise<CatalogFeedResult> {
  const now = (options.clock ?? (() => new Date()))();
  const logger = options.logger ?? defaultLogger;
  const policy = FEED_POLICIES[options.feedType];
  const snapshots = await readSnapshotCandidatesSafely(options, logger);
  const validSnapshots = snapshots.filter((snapshot) => isStoredFeedValid(snapshot, policy));
  const validSnapshot = validSnapshots[0] ?? null;

  if (snapshots.length > validSnapshots.length) {
    logger.warn("catalog.feed.snapshot.invalid", {
      feedType: options.feedType,
      page: options.page,
      runtimeMode: options.capabilities.mode,
      invalidCount: snapshots.length - validSnapshots.length,
    });
  }

  if (validSnapshot && isSnapshotFresh(validSnapshot, policy, now)) {
    return toResult(
      validSnapshot,
      {
        source: "snapshot",
        freshness: "fresh",
        notice: null,
        sourceUpdatedAt: validSnapshot.updatedAt,
      },
      now,
    );
  }

  let lease: FeedRefreshLease | null = null;
  let persistenceNotice: FeedNotice | null = null;

  if (options.capabilities.canPersistSnapshots && options.coordinator) {
    try {
      const decision = await options.coordinator.tryAcquire(options.feedType, options.page);

      if (decision.status === "acquired") {
        lease = decision.lease;
      } else if (decision.status === "busy" && validSnapshot) {
        return resolveStoredFallback(
          options,
          validSnapshot,
          {
            code: "refresh-in-progress",
            message: "Noir is refreshing this feed. The latest stored version is shown for now.",
          },
          now,
          logger,
        );
      } else if (decision.status === "cooldown") {
        return resolveStoredFallback(
          options,
          validSnapshot,
          {
            code: "refresh-cooldown",
            message: "Feed refresh is cooling down after a temporary failure.",
          },
          now,
          logger,
        );
      }
    } catch (error) {
      logger.error("catalog.feed.lease.acquire_failed", {
        feedType: options.feedType,
        page: options.page,
        runtimeMode: options.capabilities.mode,
        error: error instanceof Error ? error.message : "Unknown lease acquisition error",
      });
      persistenceNotice = {
        code: "persistence-failed",
        message: "The latest feed is available, but Noir could not coordinate its stored copy.",
      };
    }
  }

  let liveFeed: PaginatedAnimeCards;
  try {
    liveFeed = await options.liveProvider.fetchFeed(options.feedType, options.page);
  } catch (error) {
    if (lease) {
      await failLeaseSafely(options, lease, error, logger);
    }

    if (!options.liveProvider.isTemporarilyUnavailable(error)) {
      throw error;
    }

    return resolveStoredFallback(
      options,
      validSnapshot,
      staleSnapshotNotice(),
      now,
      logger,
    );
  }

  if (lease && options.coordinator) {
    try {
      await options.coordinator.commit(options.feedType, options.page, lease, liveFeed);
    } catch (error) {
      logger.error("catalog.feed.persistence.failed", {
        feedType: options.feedType,
        page: options.page,
        runtimeMode: options.capabilities.mode,
        error: error instanceof Error ? error.message : "Unknown persistence error",
      });
      await failLeaseSafely(options, lease, error, logger);
      persistenceNotice = {
        code: "persistence-failed",
        message: "The latest feed is available, but Noir could not update its stored copy.",
      };
    }
  }

  return toResult(
    liveFeed,
    {
      source: "anilist-live",
      freshness: "fresh",
      notice: persistenceNotice,
      sourceUpdatedAt: now.toISOString(),
    },
    now,
  );
}
