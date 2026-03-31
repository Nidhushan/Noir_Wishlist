import { HomeFeedShell } from "@/components/home-feed-shell";
import { HomeAnimeGrid } from "@/components/home-anime-grid";
import { Pagination } from "@/components/pagination";
import { SearchForm } from "@/components/search-form";
import { StatusPanel } from "@/components/status-panel";
import {
  getHomepageFeed,
  HOME_FEED_OPTIONS,
  type HomeFeedType,
} from "@/lib/catalog";
import Link from "next/link";

interface HomePageProps {
  searchParams?: Promise<{
    feed?: string;
    page?: string;
  }>;
}

const VALID_FEEDS = new Set<HomeFeedType>([
  "popular",
  "trending",
  "recently-completed",
  "new-episodes",
]);

function parseFeedType(value: string | undefined): HomeFeedType {
  return value && VALID_FEEDS.has(value as HomeFeedType)
    ? (value as HomeFeedType)
    : "popular";
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function getHomeFeedMeta(feedType: HomeFeedType) {
  switch (feedType) {
    case "trending":
      return {
        eyebrow: "Daily trending anime",
        heading: "See what is trending right now.",
        sectionTitle: "Trending Anime",
        emptyTitle: "No trending anime available",
        emptyMessage:
          "This feed is not available right now. Try refreshing again in a few minutes.",
      };
    case "recently-completed":
      return {
        eyebrow: "Recently completed anime",
        heading: "Catch up on shows that have just wrapped up.",
        sectionTitle: "Recently Completed",
        emptyTitle: "No recently completed anime available",
        emptyMessage:
          "This feed is not available right now. Try refreshing again in a few minutes.",
      };
    case "new-episodes":
      return {
        eyebrow: "Latest episode activity",
        heading: "Track the newest episode activity.",
        sectionTitle: "New Episodes",
        emptyTitle: "No new episode feed available",
        emptyMessage:
          "This feed is not available right now. Try again shortly.",
      };
    case "popular":
    default:
      return {
        eyebrow: "Popular anime discovery",
        heading: "Browse standout anime from Noir's growing catalog.",
        sectionTitle: "Popular Anime",
        emptyTitle: "No popular anime available",
        emptyMessage:
          "This feed is not available right now. Try refreshing again in a few minutes.",
      };
  }
}

function buildHomeHref(feedType: HomeFeedType, page: number): string {
  const params = new URLSearchParams();

  if (feedType !== "popular") {
    params.set("feed", feedType);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const feedType = parseFeedType(resolvedSearchParams?.feed);
  const page = parsePage(resolvedSearchParams?.page);
  const feedMeta = getHomeFeedMeta(feedType);
  let feed:
    | Awaited<ReturnType<typeof getHomepageFeed>>
    | null = null;
  let errorMessage: string | null = null;

  try {
    feed = await getHomepageFeed(feedType, page);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : `Something went wrong while loading the ${feedMeta.sectionTitle.toLowerCase()} feed.`;
  }

  return (
    <main className="mainContent">
      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">{feedMeta.eyebrow}</p>
          <h1>{feedMeta.heading}</h1>
          <p className="heroText">
            {errorMessage
              ? "Noir could not load this feed right now."
              : feedType === "popular"
                ? "Browse standout titles from across the catalog."
                : feedType === "trending"
                  ? "A quick look at what is getting the most attention."
                  : feedType === "recently-completed"
                    ? "See which recent series have finished and are worth catching up on."
                  : "Follow currently airing shows and recent episode activity."}
          </p>
        </div>
        <SearchForm />
      </section>

      {errorMessage ? (
        <StatusPanel
          tone="error"
          title={`${feedMeta.sectionTitle} unavailable`}
          message={errorMessage}
        />
      ) : (
        <HomeFeedShell
          currentFeed={feedType}
          navItems={HOME_FEED_OPTIONS.map((option) => ({
            ...option,
            href: buildHomeHref(option.value, 1),
          }))}
        >
          <section className="sectionHeader">
            <div>
              <p className="eyebrow">Home feed</p>
              <h2>{feedMeta.sectionTitle}</h2>
            </div>
            <p className="sectionMeta">
              {feedType === "new-episodes"
                ? `Showing ${feed?.items.length.toLocaleString()} titles`
                : `${feed?.total.toLocaleString()} titles`}
            </p>
          </section>

          <HomeAnimeGrid
            items={feed?.items ?? []}
            emptyTitle={feedMeta.emptyTitle}
            emptyMessage={feedMeta.emptyMessage}
            returnTo={buildHomeHref(feedType, page)}
          />

          {feedType === "new-episodes" ? (
            feed?.hasNextPage ? (
              <div className="pagination">
                <Link
                  className="paginationButton"
                  href={buildHomeHref(feedType, page + 1)}
                >
                  Show more
                </Link>
              </div>
            ) : null
          ) : (
            <Pagination
              currentPage={feed?.currentPage ?? page}
              hasNextPage={feed?.hasNextPage ?? false}
              buildHref={(nextPage) => buildHomeHref(feedType, nextPage)}
            />
          )}
        </HomeFeedShell>
      )}
    </main>
  );
}
