import type { AnimeCard as AnimeCardType } from "@/lib/anilist";

import { AnimeCard } from "./anime-card";

interface AnimeGridProps {
  items: AnimeCardType[];
  emptyTitle: string;
  emptyMessage: string;
}

export function AnimeGrid({ items, emptyTitle, emptyMessage }: AnimeGridProps) {
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
        <AnimeCard key={anime.anilistId} anime={anime} />
      ))}
    </section>
  );
}
