import Link from "next/link";

import { AnimeCardMenu } from "@/components/anime-card-menu";
import { CatalogImage } from "@/components/catalog-image";
import type { AnimeCard as AnimeCardType } from "@/lib/anilist";
import {
  formatCountry,
  formatEpisodes,
  formatScore,
  formatSeason,
  formatStatus,
} from "@/lib/formatters";
import type { UserAnimeState } from "@/lib/user-anime.types";

interface AnimeCardProps {
  anime: AnimeCardType;
  authenticated?: boolean;
  savedState?: UserAnimeState | null;
  returnTo?: string;
}

export function AnimeCard({
  anime,
  authenticated = false,
  savedState = null,
  returnTo = "/search",
}: AnimeCardProps) {
  return (
    <article className="animeCard">
      <div className="animeCardMenuWrap">
        <AnimeCardMenu
          anilistId={anime.anilistId}
          authenticated={authenticated}
          currentStatus={savedState?.listStatus ?? null}
          returnTo={returnTo}
        />
      </div>

      <Link className="animeCardLink" href={`/anime/${anime.anilistId}`}>
        <div className="animeCardMedia">
          <CatalogImage
            src={anime.coverImage}
            alt={`${anime.title} cover art`}
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
            className="animeCardImage"
          />
        </div>

        <div className="animeCardBody">
          <div className="animeCardTopline">
            <span>{anime.format || "Format unknown"}</span>
            <span>{formatScore(anime.averageScore)}</span>
          </div>

          <h2 className="animeCardTitle">{anime.title}</h2>

          <p className="animeCardSubtle">
            {formatSeason(anime.season, anime.seasonYear)} · {formatEpisodes(anime.episodes)}
          </p>

          <div className="animePills">
            <span>{formatStatus(anime.status)}</span>
            <span>{formatCountry(anime.countryOfOrigin)}</span>
            {savedState ? <span className="savedStatePill">{savedState.listStatus}</span> : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
