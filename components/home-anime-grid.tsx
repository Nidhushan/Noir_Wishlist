"use client";

import { useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { AnimeCard as AnimeCardType } from "@/lib/anilist";
import type { UserAnimeState } from "@/lib/user-anime.types";

import { AnimeGrid } from "./anime-grid";

interface HomeAnimeGridProps {
  items: AnimeCardType[];
  emptyTitle: string;
  emptyMessage: string;
  returnTo: string;
}

export function HomeAnimeGrid({
  items,
  emptyTitle,
  emptyMessage,
  returnTo,
}: HomeAnimeGridProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [savedStateByAniListId, setSavedStateByAniListId] = useState<Map<number, UserAnimeState>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;

    async function loadUserState() {
      if (!items.length) {
        return;
      }

      const supabase = createSupabaseBrowserClient();

      if (!supabase) {
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) {
        return;
      }

      setAuthenticated(true);

      const anilistIds = items.map((item) => item.anilistId);
      const { data: animeRows } = await supabase
        .from("anime")
        .select("id, anilist_id")
        .in("anilist_id", anilistIds);

      if (cancelled || !animeRows?.length) {
        return;
      }

      const animeIdToAniListId = new Map<number, number>();

      for (const row of animeRows as Array<Pick<Database["public"]["Tables"]["anime"]["Row"], "id" | "anilist_id">>) {
        if (row.anilist_id) {
          animeIdToAniListId.set(row.id, row.anilist_id);
        }
      }

      const animeIds = Array.from(animeIdToAniListId.keys());

      if (!animeIds.length || cancelled) {
        return;
      }

      const { data: entries } = await supabase
        .from("user_anime")
        .select("anime_id, list_status, progress, score, updated_at")
        .eq("user_id", user.id)
        .in("anime_id", animeIds);

      if (cancelled || !entries) {
        return;
      }

      const nextState = new Map<number, UserAnimeState>();

      for (const entry of entries) {
        const anilistId = animeIdToAniListId.get(entry.anime_id);

        if (!anilistId) {
          continue;
        }

        nextState.set(anilistId, {
          animeId: entry.anime_id,
          anilistId,
          listStatus: entry.list_status as UserAnimeState["listStatus"],
          progress: entry.progress,
          score: entry.score,
          updatedAt: entry.updated_at,
        });
      }

      setSavedStateByAniListId(nextState);
    }

    void loadUserState();

    return () => {
      cancelled = true;
    };
  }, [items]);

  return (
    <AnimeGrid
      items={items}
      emptyTitle={emptyTitle}
      emptyMessage={emptyMessage}
      authenticated={authenticated}
      returnTo={returnTo}
      savedStateByAniListId={savedStateByAniListId}
    />
  );
}
