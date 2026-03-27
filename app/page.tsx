import { AnimeGrid } from "@/components/anime-grid";
import { SearchForm } from "@/components/search-form";
import { StatusPanel } from "@/components/status-panel";
import { AniListError, getTrendingAnime } from "@/lib/anilist";
import { getCurrentAuthUser } from "@/lib/auth";
import { upsertAnimeBasicRecords } from "@/lib/catalog";
import { getCurrentUserAnimeMapByAniListIds } from "@/lib/user-anime";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let trending:
    | Awaited<ReturnType<typeof getTrendingAnime>>
    | null = null;
  let errorMessage: string | null = null;

  try {
    trending = await getTrendingAnime(1);
    await upsertAnimeBasicRecords(trending.items);
  } catch (error) {
    errorMessage =
      error instanceof AniListError
        ? error.message
        : "Something went wrong while loading the trending anime feed.";
  }

  const user = await getCurrentAuthUser();
  const savedStateByAniListId =
    user && trending?.items.length
      ? await getCurrentUserAnimeMapByAniListIds(trending.items.map((item) => item.anilistId))
      : new Map();

  return (
    <main className="mainContent">
      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Trending-first anime discovery</p>
          <h1>Track what is hot right now before you build everything else.</h1>
          <p className="heroText">
            {errorMessage
              ? "AniList is temporarily unavailable. Search will be available once upstream requests recover."
              : "This first release uses AniList as the live source of truth, with search and deep-linkable detail pages ready for the next phase."}
          </p>
        </div>
        <SearchForm />
      </section>

      {errorMessage ? (
        <StatusPanel
          tone="error"
          title="Trending feed unavailable"
          message={errorMessage}
        />
      ) : (
        <>
          <section className="sectionHeader">
            <div>
              <p className="eyebrow">Home feed</p>
              <h2>Trending Anime</h2>
            </div>
            <p className="sectionMeta">
              {trending?.total.toLocaleString()} titles in the AniList result set
            </p>
          </section>

          <AnimeGrid
            items={trending?.items ?? []}
            emptyTitle="No trending anime available"
            emptyMessage="AniList returned an empty result. Try refreshing again in a few minutes."
            authenticated={Boolean(user)}
            returnTo="/"
            savedStateByAniListId={savedStateByAniListId}
          />
        </>
      )}
    </main>
  );
}
