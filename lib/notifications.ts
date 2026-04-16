import type { AnimeCard } from "@/lib/anilist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ELIGIBLE_NOTIFICATION_STATUSES = ["watching", "wishlist"] as const;

export type NotificationType = "new_episode" | "anime_completed";

type AnimeRecord = Database["public"]["Tables"]["anime"]["Row"];
type AnimeEventStateRecord = Database["public"]["Tables"]["anime_event_state"]["Row"];
type AnimeEventStateInsert = Database["public"]["Tables"]["anime_event_state"]["Insert"];
type AnimeEventStateUpdate = Database["public"]["Tables"]["anime_event_state"]["Update"];
type AnimeEventRecord = Database["public"]["Tables"]["anime_events"]["Row"];
type AnimeEventInsert = Database["public"]["Tables"]["anime_events"]["Insert"];
type UserNotificationPreferenceRecord =
  Database["public"]["Tables"]["user_notification_preferences"]["Row"];
type UserNotificationRecord = Database["public"]["Tables"]["user_notifications"]["Row"];
type UserNotificationInsert = Database["public"]["Tables"]["user_notifications"]["Insert"];

export interface NotificationPreferences {
  newEpisodeEnabled: boolean;
  animeCompletedEnabled: boolean;
}

export interface UserNotificationWithAnime {
  id: number;
  animeId: number;
  animeEventId: number;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
  anime: {
    id: number;
    anilistId: number | null;
    titleDisplay: string;
    coverImage: string | null;
  } | null;
}

function getDefaultPreferences(): NotificationPreferences {
  return {
    newEpisodeEnabled: true,
    animeCompletedEnabled: true,
  };
}

function mapPreferenceRow(
  row: UserNotificationPreferenceRecord | null | undefined,
): NotificationPreferences {
  if (!row) {
    return getDefaultPreferences();
  }

  return {
    newEpisodeEnabled: row.new_episode_enabled,
    animeCompletedEnabled: row.anime_completed_enabled,
  };
}

function preferenceEnabledForType(
  preferences: NotificationPreferences,
  type: NotificationType,
): boolean {
  return type === "new_episode"
    ? preferences.newEpisodeEnabled
    : preferences.animeCompletedEnabled;
}

async function getStoredAnimeByAniListIds(
  anilistIds: number[],
): Promise<Map<number, AnimeRecord>> {
  const supabase = createSupabaseAdminClient();

  if (!supabase || !anilistIds.length) {
    return new Map();
  }

  const { data } = await supabase.from("anime").select("*").in("anilist_id", anilistIds);
  const rows = (data as AnimeRecord[] | null) ?? [];
  const animeByAniListId = new Map<number, AnimeRecord>();

  for (const row of rows) {
    if (row.anilist_id) {
      animeByAniListId.set(row.anilist_id, row);
    }
  }

  return animeByAniListId;
}

async function getAnimeEventStateMap(
  animeIds: number[],
): Promise<Map<number, AnimeEventStateRecord>> {
  const supabase = createSupabaseAdminClient();

  if (!supabase || !animeIds.length) {
    return new Map();
  }

  const { data } = await supabase
    .from("anime_event_state")
    .select("*")
    .in("anime_id", animeIds);

  const rows = (data as AnimeEventStateRecord[] | null) ?? [];
  return new Map(rows.map((row) => [row.anime_id, row]));
}

async function upsertAnimeEventState(
  animeId: number,
  payload: AnimeEventStateInsert | AnimeEventStateUpdate,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  await supabase.from("anime_event_state").upsert(
    {
      anime_id: animeId,
      ...payload,
    },
    { onConflict: "anime_id" },
  );
}

async function findExistingAnimeEvent(
  animeId: number,
  type: NotificationType,
  episodeNumber: number | null,
): Promise<AnimeEventRecord | null> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  let request = supabase
    .from("anime_events")
    .select("*")
    .eq("anime_id", animeId)
    .eq("event_type", type);

  if (type === "new_episode" && episodeNumber != null) {
    request = request.eq("episode_number", episodeNumber);
  } else {
    request = request.is("episode_number", null);
  }

  const { data } = await request.maybeSingle();
  return (data as AnimeEventRecord | null) ?? null;
}

async function createOrGetAnimeEvent(input: {
  animeId: number;
  type: NotificationType;
  episodeNumber?: number | null;
  eventOccurredAt: string;
  payload?: Database["public"]["Tables"]["anime_events"]["Insert"]["payload"];
}): Promise<AnimeEventRecord | null> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const episodeNumber = input.type === "new_episode" ? input.episodeNumber ?? null : null;
  const existing = await findExistingAnimeEvent(input.animeId, input.type, episodeNumber);

  if (existing) {
    return existing;
  }

  const payload: AnimeEventInsert = {
    anime_id: input.animeId,
    event_type: input.type,
    episode_number: episodeNumber,
    event_occurred_at: input.eventOccurredAt,
    payload: input.payload ?? {},
  };

  const { data, error } = await supabase
    .from("anime_events")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return findExistingAnimeEvent(input.animeId, input.type, episodeNumber);
  }

  return (data as AnimeEventRecord | null) ?? null;
}

function buildNotificationCopy(
  type: NotificationType,
  anime: AnimeRecord,
  episodeNumber?: number | null,
): { title: string; message: string } {
  if (type === "new_episode") {
    return {
      title: "New episode available",
      message:
        episodeNumber && episodeNumber > 0
          ? `${anime.title_display} episode ${episodeNumber} is available now.`
          : `${anime.title_display} has a new episode available.`,
    };
  }

  return {
    title: "Finished airing",
    message: `${anime.title_display} has finished airing.`,
  };
}

async function fanOutUserNotificationsForEvent(
  animeEvent: AnimeEventRecord,
  anime: AnimeRecord,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const { data: libraryRows } = await supabase
    .from("user_anime")
    .select("user_id, list_status")
    .eq("anime_id", anime.id)
    .in("list_status", [...ELIGIBLE_NOTIFICATION_STATUSES]);

  const rows = (libraryRows as Array<{ user_id: string; list_status: string }> | null) ?? [];

  if (!rows.length) {
    return;
  }

  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const { data: preferenceRows } = await supabase
    .from("user_notification_preferences")
    .select("*")
    .in("user_id", userIds);

  const preferenceMap = new Map(
    ((preferenceRows as UserNotificationPreferenceRecord[] | null) ?? []).map((row) => [
      row.user_id,
      row,
    ]),
  );

  const inserts: UserNotificationInsert[] = [];

  for (const userId of userIds) {
    const preferences = mapPreferenceRow(preferenceMap.get(userId));

    if (!preferenceEnabledForType(preferences, animeEvent.event_type as NotificationType)) {
      continue;
    }

    const copy = buildNotificationCopy(
      animeEvent.event_type as NotificationType,
      anime,
      animeEvent.episode_number,
    );

    inserts.push({
      user_id: userId,
      anime_event_id: animeEvent.id,
      anime_id: anime.id,
      type: animeEvent.event_type,
      title: copy.title,
      message: copy.message,
    });
  }

  if (!inserts.length) {
    return;
  }

  await supabase.from("user_notifications").upsert(inserts, {
    onConflict: "user_id,anime_event_id",
  });
}

export async function processNewEpisodeFeedNotifications(items: AnimeCard[]): Promise<void> {
  const filteredItems = items.filter(
    (item): item is AnimeCard & { latestEpisodeNumber: number; latestEpisodeAt?: string | null } =>
      Boolean(item.anilistId) &&
      typeof item.latestEpisodeNumber === "number" &&
      item.latestEpisodeNumber > 0,
  );

  if (!filteredItems.length) {
    return;
  }

  const animeByAniListId = await getStoredAnimeByAniListIds(
    filteredItems.map((item) => item.anilistId),
  );
  const eventStateMap = await getAnimeEventStateMap(
    Array.from(new Set(Array.from(animeByAniListId.values()).map((anime) => anime.id))),
  );

  for (const item of filteredItems) {
    const anime = animeByAniListId.get(item.anilistId);

    if (!anime) {
      continue;
    }

    const eventState = eventStateMap.get(anime.id);
    const latestEpisodeNumber = item.latestEpisodeNumber ?? null;
    const latestEpisodeAt = item.latestEpisodeAt ?? new Date().toISOString();

    if (!eventState) {
      await upsertAnimeEventState(anime.id, {
        last_episode_number: latestEpisodeNumber,
        last_episode_at: latestEpisodeAt,
        is_completed: false,
        last_checked_at: new Date().toISOString(),
      });
      continue;
    }

    if (eventState.last_episode_number == null) {
      await upsertAnimeEventState(anime.id, {
        last_episode_number: latestEpisodeNumber,
        last_episode_at: latestEpisodeAt,
        last_checked_at: new Date().toISOString(),
      });
      continue;
    }

    if (latestEpisodeNumber <= eventState.last_episode_number) {
      await upsertAnimeEventState(anime.id, {
        last_episode_at: latestEpisodeAt,
        last_checked_at: new Date().toISOString(),
      });
      continue;
    }

    const animeEvent = await createOrGetAnimeEvent({
      animeId: anime.id,
      type: "new_episode",
      episodeNumber: latestEpisodeNumber,
      eventOccurredAt: latestEpisodeAt,
      payload: {
        episodeNumber: latestEpisodeNumber,
      },
    });

    if (animeEvent) {
      await fanOutUserNotificationsForEvent(animeEvent, anime);
    }

    await upsertAnimeEventState(anime.id, {
      last_episode_number: latestEpisodeNumber,
      last_episode_at: latestEpisodeAt,
      last_checked_at: new Date().toISOString(),
    });
  }
}

export async function processRecentlyCompletedFeedNotifications(
  items: AnimeCard[],
): Promise<void> {
  if (!items.length) {
    return;
  }

  const animeByAniListId = await getStoredAnimeByAniListIds(items.map((item) => item.anilistId));
  const eventStateMap = await getAnimeEventStateMap(
    Array.from(new Set(Array.from(animeByAniListId.values()).map((anime) => anime.id))),
  );

  for (const item of items) {
    const anime = animeByAniListId.get(item.anilistId);

    if (!anime) {
      continue;
    }

    const eventState = eventStateMap.get(anime.id);
    const completedAt = item.completedAt ?? new Date().toISOString();

    if (!eventState) {
      await upsertAnimeEventState(anime.id, {
        is_completed: true,
        completed_at: completedAt,
        last_checked_at: new Date().toISOString(),
      });
      continue;
    }

    if (eventState.is_completed) {
      await upsertAnimeEventState(anime.id, {
        completed_at: eventState.completed_at ?? completedAt,
        last_checked_at: new Date().toISOString(),
      });
      continue;
    }

    const animeEvent = await createOrGetAnimeEvent({
      animeId: anime.id,
      type: "anime_completed",
      eventOccurredAt: completedAt,
    });

    if (animeEvent) {
      await fanOutUserNotificationsForEvent(animeEvent, anime);
    }

    await upsertAnimeEventState(anime.id, {
      is_completed: true,
      completed_at: completedAt,
      last_checked_at: new Date().toISOString(),
    });
  }
}

export async function getCurrentUserNotificationPreferences(): Promise<NotificationPreferences | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("user_notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return mapPreferenceRow(data as UserNotificationPreferenceRecord | null);
}

export async function updateCurrentUserNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase is not configured yet." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please log in before updating notification settings." };
  }

  const { error } = await supabase
    .from("user_notification_preferences")
    .upsert(
      {
        user_id: user.id,
        new_episode_enabled: preferences.newEpisodeEnabled,
        anime_completed_enabled: preferences.animeCompletedEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  return { error: error?.message ?? null };
}

export async function getCurrentUserNotifications(
  limit = 100,
): Promise<UserNotificationWithAnime[] | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("user_notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return null;
  }

  const rows = (data as UserNotificationRecord[] | null) ?? [];
  const animeIds = Array.from(new Set(rows.map((row) => row.anime_id)));
  const { data: animeRows } = animeIds.length
    ? await supabase.from("anime").select("id, anilist_id, title_display, cover_image").in("id", animeIds)
    : { data: [] };

  const animeById = new Map(
    (((animeRows as Array<Pick<AnimeRecord, "id" | "anilist_id" | "title_display" | "cover_image">> | null) ?? []).map(
      (row) => [row.id, row],
    )),
  );

  return rows.map((row) => {
    const anime = animeById.get(row.anime_id);

    return {
      id: row.id,
      animeId: row.anime_id,
      animeEventId: row.anime_event_id,
      type: row.type as NotificationType,
      title: row.title,
      message: row.message,
      isRead: row.is_read,
      createdAt: row.created_at,
      readAt: row.read_at,
      anime: anime
        ? {
            id: anime.id,
            anilistId: anime.anilist_id,
            titleDisplay: anime.title_display,
            coverImage: anime.cover_image,
          }
        : null,
    };
  });
}

export async function markNotificationRead(
  notificationId: number,
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase is not configured yet." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please log in before editing notifications." };
  }

  const { error } = await supabase
    .from("user_notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("id", notificationId);

  return { error: error?.message ?? null };
}

export async function markAllNotificationsRead(): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase is not configured yet." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please log in before editing notifications." };
  }

  const { error } = await supabase
    .from("user_notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return { error: error?.message ?? null };
}
