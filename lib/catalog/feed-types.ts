import type { PaginatedAnimeCards } from "@/lib/anilist";

export const HOME_FEED_OPTIONS = [
  { value: "popular", label: "Popular" },
  { value: "trending", label: "Trending" },
  { value: "recently-completed", label: "Recently Completed" },
  { value: "new-episodes", label: "New Episodes" },
] as const;

export type HomeFeedType = (typeof HOME_FEED_OPTIONS)[number]["value"];

export type FeedSource = "anilist-live" | "snapshot" | "local-catalog";
export type FeedFreshness = "fresh" | "stale";

export type FeedNoticeCode =
  | "using-stale-snapshot"
  | "persistence-failed"
  | "refresh-in-progress"
  | "refresh-cooldown"
  | "local-fallback";

export interface FeedNotice {
  code: FeedNoticeCode;
  message: string;
}

export interface CatalogFeedResult extends PaginatedAnimeCards {
  source: FeedSource;
  freshness: FeedFreshness;
  notice: FeedNotice | null;
  resolvedAt: string;
  sourceUpdatedAt: string | null;
}

export interface StoredFeedCandidate extends PaginatedAnimeCards {
  updatedAt: string;
  expectedItemCount: number;
}
