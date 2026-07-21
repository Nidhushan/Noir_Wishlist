import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { NotificationType } from "@/lib/notifications/observation-types";

export type { NotificationType } from "@/lib/notifications/observation-types";

type AnimeRecord = Database["public"]["Tables"]["anime"]["Row"];
type UserNotificationPreferenceRecord =
  Database["public"]["Tables"]["user_notification_preferences"]["Row"];
type UserNotificationRecord = Database["public"]["Tables"]["user_notifications"]["Row"];

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
