import { AnimeGrid } from "@/components/anime-grid";
import { SearchForm } from "@/components/search-form";
import { StatusPanel } from "@/components/status-panel";
import { getCurrentAuthUser } from "@/lib/auth";
import { getCatalogHomepageFeed } from "@/lib/catalog";
import { getCurrentUserAnimeMapByAniListIds } from "@/lib/user-anime";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let trending:
    | Awaited<ReturnType<typeof getCatalogHomepageFeed>>
    | null = null;
  let errorMessage: string | null = null;

  try {
    trending = await getCatalogHomepageFeed(1);
  } catch (error) {
    errorMessage =
      error instanceof Error
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
              ? "Noir could not load the catalog feed right now."
              : trending?.source === "database"
                ? "The homepage now serves from Noir's local catalog first, which keeps it faster and less dependent on live AniList calls."
                : "Noir fell back to live AniList data because the local catalog did not have enough feed data yet."}
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
          {trending?.notice ? (
            <StatusPanel title="Catalog source" message={trending.notice} />
          ) : null}

          <section className="sectionHeader">
            <div>
              <p className="eyebrow">Home feed</p>
              <h2>Trending Anime</h2>
            </div>
            <p className="sectionMeta">
              {trending?.source === "database"
                ? `${trending?.total.toLocaleString()} titles in the local catalog`
                : `${trending?.total.toLocaleString()} titles in the AniList result set`}
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
