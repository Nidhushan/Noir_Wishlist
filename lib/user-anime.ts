import type { AnimeRecord } from "@/lib/catalog";
import { ensureAnimePersisted } from "@/lib/catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const USER_LIST_STATUSES = [
  "wishlist",
  "watching",
  "completed",
  "dropped",
] as const;

export type UserListStatus = (typeof USER_LIST_STATUSES)[number];

export interface UserAnimeRow {
  id: number;
  user_id: string;
  anime_id: number;
  list_status: UserListStatus;
  progress: number;
  score: number | null;
  notes: string | null;
  priority: number | null;
  added_at: string;
  updated_at: string;
  anime: AnimeRecord | null;
}

export async function upsertUserAnimeEntry(input: {
  anilistId: number;
  listStatus: UserListStatus;
}) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase is not configured yet." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please log in before saving anime." };
  }

  const anime = await ensureAnimePersisted(input.anilistId);

  if (!anime) {
    return { error: "The anime could not be stored in the catalog." };
  }

  const { error } = await supabase.from("user_anime").upsert(
    {
      user_id: user.id,
      anime_id: anime.id,
      list_status: input.listStatus,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,anime_id" },
  );

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function updateUserAnimeStatus(input: {
  animeId: number;
  listStatus: UserListStatus;
}) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase is not configured yet." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please log in before editing your list." };
  }

  const { error } = await supabase
    .from("user_anime")
    .update({
      list_status: input.listStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("anime_id", input.animeId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function removeUserAnimeEntry(animeId: number) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase is not configured yet." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please log in before editing your list." };
  }

  const { error } = await supabase
    .from("user_anime")
    .delete()
    .eq("user_id", user.id)
    .eq("anime_id", animeId);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function getCurrentUserAnimeByStatus() {
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
    .from("user_anime")
    .select("id, user_id, anime_id, list_status, progress, score, notes, priority, added_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return null;
  }

  const rows = (data as UserAnimeRow[]) ?? [];
  const animeIds = Array.from(new Set(rows.map((row) => row.anime_id)));

  const { data: animeRows } = animeIds.length
    ? await supabase.from("anime").select("*").in("id", animeIds)
    : { data: [] };

  const animeById = new Map(
    ((animeRows as AnimeRecord[] | null) ?? []).map((row) => [row.id, row]),
  );

  return USER_LIST_STATUSES.map((status) => ({
    status,
    items: rows
      .filter((row) => row.list_status === status)
      .map((row) => ({
        ...row,
        anime: animeById.get(row.anime_id) ?? null,
      })),
  }));
}
