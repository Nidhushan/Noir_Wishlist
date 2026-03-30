import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogImage } from "@/components/catalog-image";
import { SaveAnimeForm } from "@/components/save-anime-form";
import { StatusPanel } from "@/components/status-panel";
import { AniListError } from "@/lib/anilist";
import { getCurrentAuthUser } from "@/lib/auth";
import { getCatalogAnimeDetail } from "@/lib/catalog";
import {
  formatCountry,
  formatEpisodes,
  formatPopularity,
  formatScore,
  formatSeason,
  formatStatus,
} from "@/lib/formatters";
import { getCurrentUserAnimeMapByAniListIds } from "@/lib/user-anime";

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
    const result = await getCatalogAnimeDetail(numericId);
    const anime = result.anime;

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
        `${anime.title} on Noir.`,
      openGraph: previewImage
        ? {
            title: anime.title,
            description:
              anime.description ||
              `${anime.title} on Noir.`,
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
  let detailResult:
    | Awaited<ReturnType<typeof getCatalogAnimeDetail>>
    | null = null;
  let errorMessage: string | null = null;

  if (!Number.isInteger(numericId) || numericId <= 0) {
    notFound();
  }

  try {
    detailResult = await getCatalogAnimeDetail(numericId);
  } catch (error) {
    if (error instanceof AniListError && error.code === "invalid_request") {
      notFound();
    }

    errorMessage =
      error instanceof AniListError
        ? error.message
        : "Noir could not load this anime page.";
  }

  const anime = detailResult?.anime ?? null;

  if (!anime && !errorMessage) {
    notFound();
  }

  const user = anime ? await getCurrentAuthUser() : null;
  const savedState = anime && user
    ? (await getCurrentUserAnimeMapByAniListIds([anime.anilistId])).get(anime.anilistId) ?? null
    : null;

  return (
    <main className="mainContent">
      {errorMessage || !anime ? (
        <StatusPanel
          tone="error"
          title="Anime detail unavailable"
          message={errorMessage || "Noir could not load this anime page."}
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
                  unoptimized
                />
              ) : null}
              <div className="detailBackdropOverlay" />
            </div>

            <div className="detailHeroContent">
              <div className="detailPoster">
                <CatalogImage
                  src={anime.coverImage}
                  alt={`${anime.title} poster`}
                  sizes="(max-width: 768px) 50vw, 240px"
                  className="animeCardImage"
                />
              </div>

              <div className="detailSummary">
                <p className="eyebrow">Anime details</p>
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
                    "No description is available for this anime yet."}
                </p>

                <div className="buttonRow">
                  <Link className="paginationButton" href="/">
                    Back to home
                  </Link>
                  <SaveAnimeForm
                    anilistId={anime.anilistId}
                    authenticated={Boolean(user)}
                    currentStatus={savedState?.listStatus ?? null}
                    listStatus={savedState?.listStatus ?? "wishlist"}
                    returnTo={`/anime/${anime.anilistId}`}
                  />
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
                  Genres are not available for this anime yet.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
