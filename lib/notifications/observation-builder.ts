import type { AnimeCard, TrackedAnimeNotificationState } from "@/lib/anilist";
import type { HomeFeedType } from "@/lib/catalog/feed-types";

import type { NotificationObservation } from "./observation-types";

function normalizeTimestamp(value: string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

export function buildNotificationObservations(
  feedType: HomeFeedType,
  items: AnimeCard[],
  observedAt = new Date(),
): NotificationObservation[] {
  const fallbackTimestamp = observedAt.toISOString();
  const observations = new Map<string, NotificationObservation>();

  for (const item of items) {
    if (!Number.isInteger(item.anilistId) || item.anilistId <= 0) {
      continue;
    }

    if (feedType === "new-episodes") {
      const episodeNumber = item.latestEpisodeNumber;

      if (!Number.isInteger(episodeNumber) || (episodeNumber ?? 0) <= 0) {
        continue;
      }

      const observation: NotificationObservation = {
        observation_type: "new_episode",
        anilist_id: item.anilistId,
        episode_number: episodeNumber as number,
        event_occurred_at: normalizeTimestamp(item.latestEpisodeAt, fallbackTimestamp),
        payload: { episodeNumber },
      };

      observations.set(`new_episode:${item.anilistId}:${episodeNumber}`, observation);
    }

    if (feedType === "recently-completed") {
      const observation: NotificationObservation = {
        observation_type: "anime_completed",
        anilist_id: item.anilistId,
        episode_number: null,
        event_occurred_at: normalizeTimestamp(item.completedAt, fallbackTimestamp),
        payload: {},
      };

      observations.set(`anime_completed:${item.anilistId}`, observation);
    }
  }

  return Array.from(observations.values()).sort((left, right) => {
    if (left.event_occurred_at !== right.event_occurred_at) {
      return left.event_occurred_at.localeCompare(right.event_occurred_at);
    }

    if (left.anilist_id !== right.anilist_id) {
      return left.anilist_id - right.anilist_id;
    }

    return (left.episode_number ?? 0) - (right.episode_number ?? 0);
  });
}

export function buildTrackedNotificationObservations(
  states: TrackedAnimeNotificationState[],
  observedAt = new Date(),
): NotificationObservation[] {
  const observedAtIso = observedAt.toISOString();
  const observedAtSeconds = Math.floor(observedAt.getTime() / 1000);
  const observations = new Map<string, NotificationObservation>();

  for (const state of states) {
    if (state.status === "FINISHED") {
      observations.set(`anime_completed:${state.anilistId}`, {
        observation_type: "anime_completed",
        anilist_id: state.anilistId,
        episode_number: null,
        event_occurred_at: normalizeTimestamp(state.completedAt, observedAtIso),
        payload: {
          collector: "tracked-anime",
          upstreamStatus: state.status,
          totalEpisodes: state.totalEpisodes,
        },
      });
      continue;
    }

    const nextEpisodeNumber = state.nextEpisodeNumber;
    if (!nextEpisodeNumber || nextEpisodeNumber < 1) {
      continue;
    }

    const nextEpisodeAtSeconds = state.nextEpisodeAt
      ? Math.floor(new Date(state.nextEpisodeAt).getTime() / 1000)
      : null;
    const latestEpisodeNumber =
      nextEpisodeAtSeconds !== null &&
      Number.isFinite(nextEpisodeAtSeconds) &&
      nextEpisodeAtSeconds <= observedAtSeconds
        ? nextEpisodeNumber
        : nextEpisodeNumber - 1;

    if (latestEpisodeNumber < 1) {
      continue;
    }

    observations.set(`new_episode:${state.anilistId}:${latestEpisodeNumber}`, {
      observation_type: "new_episode",
      anilist_id: state.anilistId,
      episode_number: latestEpisodeNumber,
      event_occurred_at:
        latestEpisodeNumber === nextEpisodeNumber
          ? normalizeTimestamp(state.nextEpisodeAt, observedAtIso)
          : observedAtIso,
      payload: {
        collector: "tracked-anime",
        upstreamStatus: state.status,
        nextEpisodeNumber,
        nextEpisodeAt: state.nextEpisodeAt,
      },
    });
  }

  return Array.from(observations.values()).sort((left, right) => {
    if (left.anilist_id !== right.anilist_id) {
      return left.anilist_id - right.anilist_id;
    }

    return left.observation_type.localeCompare(right.observation_type);
  });
}
