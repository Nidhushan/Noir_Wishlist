import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AnimeGrid } from "@/components/anime-grid";
import { Pagination } from "@/components/pagination";
import { SearchForm } from "@/components/search-form";
import { StatusPanel } from "@/components/status-panel";
import { normalizeSearchSort, SEARCH_SORT_OPTIONS } from "@/lib/anilist";
import { getCurrentAuthUser } from "@/lib/auth";
import { searchCatalogAnime } from "@/lib/catalog";
import { getCurrentUserAnimeMapByAniListIds } from "@/lib/user-anime";

export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
  }>;
}

function buildSearchHref(query: string, page: number, sort: string): string {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    sort,
  });

  return `/search?${params.toString()}`;
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim();

  if (!query) {
    return {
      title: "Search",
      description: "Search anime titles sourced directly from AniList.",
    };
  }

  return {
    title: `Search: ${query}`,
    description: `Search results for ${query} sourced directly from AniList.`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, page, sort } = await searchParams;
  const query = q?.trim().replace(/\s+/g, " ") || "";
  const currentPage = Math.max(1, Number(page || "1") || 1);
  const currentSort = normalizeSearchSort(sort);
  const currentSortLabel =
    SEARCH_SORT_OPTIONS.find((option) => option.value === currentSort)?.label ||
    "Best match";
  const currentSearchHref = buildSearchHref(query, currentPage, currentSort);
  let results:
    | Awaited<ReturnType<typeof searchCatalogAnime>>
    | null = null;
  let errorMessage: string | null = null;

  if (!query) {
    return (
      <main className="mainContent">
        <section className="hero compactHero">
          <div className="heroCopy">
            <p className="eyebrow">Search</p>
            <h1>Find anime titles from AniList.</h1>
            <p className="heroText">
              Enter at least two characters to search by English, Romaji, or native title.
            </p>
          </div>
          <SearchForm initialQuery={query} initialSort={currentSort} compact />
        </section>

        <StatusPanel
          title="Search ready"
          message="Type a title in the search bar above to load matching anime results."
        />
      </main>
    );
  }

  if (query.length < 2) {
    return (
      <main className="mainContent">
        <section className="hero compactHero">
          <div className="heroCopy">
            <p className="eyebrow">Search</p>
            <h1>Search terms need at least two characters.</h1>
            <p className="heroText">
              Shorter queries are blocked before hitting AniList to avoid noisy requests.
            </p>
          </div>
          <SearchForm initialQuery={query} initialSort={currentSort} compact />
        </section>

        <StatusPanel
          tone="error"
          title="Search query too short"
          message="Use at least 2 characters, then submit again."
        />
      </main>
    );
  }

  try {
    results = await searchCatalogAnime(query, currentPage, currentSort);
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "The catalog could not complete the search request.";
  }

  if (!errorMessage && results && currentPage > 1 && results.items.length === 0) {
    redirect(buildSearchHref(query, 1, currentSort));
  }

  const user = await getCurrentAuthUser();
  const savedStateByAniListId =
    user && results?.items.length
      ? await getCurrentUserAnimeMapByAniListIds(results.items.map((item) => item.anilistId))
      : new Map();

  return (
    <main className="mainContent">
      <section className="hero compactHero">
        <div className="heroCopy">
          <p className="eyebrow">Search</p>
          <h1>{errorMessage ? "Search is temporarily unavailable." : `Results for “${query}”`}</h1>
          <p className="heroText">
            {errorMessage
              ? "Noir could not complete the search request."
              : results?.source === "database"
                ? `Noir returned ${results?.total.toLocaleString()} local catalog matches, sorted by ${currentSortLabel.toLowerCase()}.`
                : `Noir fetched ${results?.total.toLocaleString()} live AniList matches because the local catalog did not have enough results.`}
          </p>
        </div>
        <SearchForm initialQuery={query} initialSort={currentSort} compact />
      </section>

      {errorMessage ? (
        <StatusPanel tone="error" title="Search failed" message={errorMessage} />
      ) : (
        <>
          {results?.notice ? (
            <StatusPanel title="Catalog source" message={results.notice} />
          ) : null}

          <AnimeGrid
            items={results?.items ?? []}
            emptyTitle="No anime matched that query"
            emptyMessage="Try a different spelling, a shorter phrase, or wait for the catalog to grow."
            authenticated={Boolean(user)}
            returnTo={currentSearchHref}
            savedStateByAniListId={savedStateByAniListId}
          />

          <Pagination
            currentPage={results?.currentPage ?? currentPage}
            hasNextPage={results?.hasNextPage ?? false}
            buildHref={(targetPage) => buildSearchHref(query, targetPage, currentSort)}
          />
        </>
      )}
    </main>
  );
}
