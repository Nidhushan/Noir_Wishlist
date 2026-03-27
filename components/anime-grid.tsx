import type { AnimeCard as AnimeCardType } from "@/lib/anilist";
import type { UserAnimeState } from "@/lib/user-anime.types";

import { AnimeCard } from "./anime-card";

interface AnimeGridProps {
  items: AnimeCardType[];
  emptyTitle: string;
  emptyMessage: string;
  authenticated?: boolean;
  returnTo?: string;
  savedStateByAniListId?: Map<number, UserAnimeState>;
}

export function AnimeGrid({
  items,
  emptyTitle,
  emptyMessage,
  authenticated = false,
  returnTo = "/",
  savedStateByAniListId = new Map(),
}: AnimeGridProps) {
  if (!items.length) {
    return (
      <section className="emptyState">
        <h2>{emptyTitle}</h2>
        <p>{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="animeGrid" aria-live="polite">
      {items.map((anime) => (
        <AnimeCard
          key={anime.anilistId}
          anime={anime}
          authenticated={authenticated}
          returnTo={returnTo}
          savedState={savedStateByAniListId.get(anime.anilistId) ?? null}
        />
      ))}
    </section>
  );
}
