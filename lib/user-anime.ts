import type { AnimeRecord } from "@/lib/catalog";
import { ensureAnimePersisted } from "@/lib/catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  USER_LIST_STATUSES,
  type UserAnimeRow,
  type UserAnimeState,
  type UserListStatus,
} from "@/lib/user-anime.types";

export { USER_LIST_STATUSES };
export type { UserAnimeRow, UserAnimeState, UserListStatus };

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

export async function updateUserAnimeProgress(input: {
  animeId: number;
  progress: number;
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

  const progress = Number.isFinite(input.progress) ? Math.max(0, Math.floor(input.progress)) : 0;

  const { error } = await supabase
    .from("user_anime")
    .update({
      progress,
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

export async function getCurrentUserAnimeSection(status: UserListStatus) {
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
    .eq("list_status", status)
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

  return rows.map((row) => ({
    ...row,
    anime: animeById.get(row.anime_id) ?? null,
  }));
}

export async function getCurrentUserAnimeMapByAniListIds(
  anilistIds: number[],
): Promise<Map<number, UserAnimeState>> {
  const dedupedIds = Array.from(
    new Set(
      anilistIds.filter((id) => Number.isInteger(id) && id > 0),
    ),
  );

  if (!dedupedIds.length) {
    return new Map();
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return new Map();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Map();
  }

  const { data: animeRows, error: animeError } = await supabase
    .from("anime")
    .select("id, anilist_id")
    .in("anilist_id", dedupedIds);

  if (animeError || !animeRows?.length) {
    return new Map();
  }

  const animeIdToAniListId = new Map<number, number>();

  for (const row of animeRows) {
    if (row.anilist_id) {
      animeIdToAniListId.set(row.id, row.anilist_id);
    }
  }

  const animeIds = Array.from(animeIdToAniListId.keys());

  if (!animeIds.length) {
    return new Map();
  }

  const { data: entries, error } = await supabase
    .from("user_anime")
    .select("anime_id, list_status, progress, score, updated_at")
    .eq("user_id", user.id)
    .in("anime_id", animeIds);

  if (error || !entries?.length) {
    return new Map();
  }

  const stateByAniListId = new Map<number, UserAnimeState>();

  for (const entry of entries) {
    const anilistId = animeIdToAniListId.get(entry.anime_id);

    if (!anilistId) {
      continue;
    }

    stateByAniListId.set(anilistId, {
      animeId: entry.anime_id,
      anilistId,
      listStatus: entry.list_status as UserListStatus,
      progress: entry.progress,
      score: entry.score,
      updatedAt: entry.updated_at,
    });
  }

  return stateByAniListId;
}
