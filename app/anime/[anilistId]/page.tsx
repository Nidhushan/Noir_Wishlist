import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SaveAnimeForm } from "@/components/save-anime-form";
import { StatusPanel } from "@/components/status-panel";
import { AniListError } from "@/lib/anilist";
import { getHydratedAnimeDetail } from "@/lib/catalog";
import {
  formatCountry,
  formatEpisodes,
  formatPopularity,
  formatScore,
  formatSeason,
  formatStatus,
} from "@/lib/formatters";

export const dynamic = "force-dynamic";

interface AnimeDetailPageProps {
  params: Promise<{
    anilistId: string;
  }>;
}

export async function generateMetadata({
  params,
}: AnimeDetailPageProps): Promise<Metadata> {
  const { anilistId } = await params;
  const numericId = Number(anilistId);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return {
      title: "Anime Not Found",
    };
  }

  try {
    const anime = await getHydratedAnimeDetail(numericId);

    if (!anime) {
      return {
        title: "Anime Not Found",
      };
    }

    const previewImage = anime.bannerImage || anime.coverImage || undefined;

    return {
      title: anime.title,
      description:
        anime.description ||
        `${anime.title} on Noir, sourced directly from AniList.`,
      openGraph: previewImage
        ? {
            title: anime.title,
            description:
              anime.description ||
              `${anime.title} on Noir, sourced directly from AniList.`,
            images: [previewImage],
          }
        : undefined,
    };
  } catch {
    return {
      title: "Anime",
    };
  }
}

export default async function AnimeDetailPage({
  params,
}: AnimeDetailPageProps) {
  const { anilistId } = await params;
  const numericId = Number(anilistId);
  let anime:
    | Awaited<ReturnType<typeof getHydratedAnimeDetail>>
    | null = null;
  let errorMessage: string | null = null;

  if (!Number.isInteger(numericId) || numericId <= 0) {
    notFound();
  }

  try {
    anime = await getHydratedAnimeDetail(numericId);
  } catch (error) {
    if (error instanceof AniListError && error.code === "invalid_request") {
      notFound();
    }

    errorMessage =
      error instanceof AniListError
        ? error.message
        : "AniList could not load the anime detail page.";
  }

  if (!anime && !errorMessage) {
    notFound();
  }

  return (
    <main className="mainContent">
      {errorMessage || !anime ? (
        <StatusPanel
          tone="error"
          title="Anime detail unavailable"
          message={errorMessage || "AniList could not load the anime detail page."}
        />
      ) : (
        <>
          <section className="detailHero">
            <div className="detailBackdrop">
              {anime.bannerImage ? (
                <Image
                  src={anime.bannerImage}
                  alt={`${anime.title} banner`}
                  fill
                  priority
                  sizes="100vw"
                  className="detailBanner"
                />
              ) : null}
              <div className="detailBackdropOverlay" />
            </div>

            <div className="detailHeroContent">
              <div className="detailPoster">
                {anime.coverImage ? (
                  <Image
                    src={anime.coverImage}
                    alt={`${anime.title} poster`}
                    fill
                    sizes="(max-width: 768px) 50vw, 240px"
                    className="animeCardImage"
                  />
                ) : (
                  <div className="animeCardPlaceholder">No cover available</div>
                )}
              </div>

              <div className="detailSummary">
                <p className="eyebrow">AniList detail view</p>
                <h1>{anime.title}</h1>
                <p className="detailMeta">
                  {anime.format || "Format unknown"} · {formatStatus(anime.status)} ·{" "}
                  {formatEpisodes(anime.episodes)}
                </p>

                <div className="animePills detailPills">
                  <span>{formatSeason(anime.season, anime.seasonYear)}</span>
                  <span>{formatCountry(anime.countryOfOrigin)}</span>
                  <span>{formatScore(anime.averageScore)}</span>
                </div>

                <p className="detailDescription">
                  {anime.description ||
                    "AniList does not currently expose a description for this anime."}
                </p>

                <div className="buttonRow">
                  <Link className="paginationButton" href="/">
                    Back to home
                  </Link>
                  <SaveAnimeForm anilistId={anime.anilistId} returnTo={`/anime/${anime.anilistId}`} />
                  {anime.siteUrl ? (
                    <a
                      className="paginationButton"
                      href={anime.siteUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on AniList
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="detailGrid">
            <div className="detailPanel">
              <h2>Quick facts</h2>
              <dl className="detailFacts">
                <div>
                  <dt>Popularity</dt>
                  <dd>{formatPopularity(anime.popularity)}</dd>
                </div>
                <div>
                  <dt>English title</dt>
                  <dd>{anime.titleEnglish || "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Romaji title</dt>
                  <dd>{anime.titleRomaji || "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Native title</dt>
                  <dd>{anime.titleNative || "Unavailable"}</dd>
                </div>
              </dl>
            </div>

            <div className="detailPanel">
              <h2>Genres</h2>
              {anime.genres.length ? (
                <div className="animePills">
                  {anime.genres.map((genre) => (
                    <span key={genre}>{genre}</span>
                  ))}
                </div>
              ) : (
                <p className="detailEmpty">
                  AniList does not currently list genres for this anime.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
