import Image from "next/image";
import Link from "next/link";

import type { AnimeCard as AnimeCardType } from "@/lib/anilist";
import {
  formatCountry,
  formatEpisodes,
  formatScore,
  formatSeason,
  formatStatus,
} from "@/lib/formatters";

interface AnimeCardProps {
  anime: AnimeCardType;
}

export function AnimeCard({ anime }: AnimeCardProps) {
  return (
    <article className="animeCard">
      <Link className="animeCardLink" href={`/anime/${anime.anilistId}`}>
        <div className="animeCardMedia">
          {anime.coverImage ? (
            <Image
              src={anime.coverImage}
              alt={`${anime.title} cover art`}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
              className="animeCardImage"
            />
          ) : (
            <div className="animeCardPlaceholder">No cover available</div>
          )}
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
          </div>
        </div>
      </Link>
    </article>
  );
}
