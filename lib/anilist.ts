import { unstable_cache } from "next/cache";

const ANILIST_API_URL = "https://graphql.anilist.co";

const TRENDING_REVALIDATE_SECONDS = 60 * 60 * 6;
const POPULAR_REVALIDATE_SECONDS = 60 * 60 * 24;
const RECENTLY_COMPLETED_REVALIDATE_SECONDS = 60 * 60 * 24;
const NEW_EPISODES_REVALIDATE_SECONDS = 60 * 10;
const SEARCH_REVALIDATE_SECONDS = 60 * 5;
const DETAIL_REVALIDATE_SECONDS = 60 * 60 * 24;

type Nullable<T> = T | null;

interface AniListTitle {
  romaji: Nullable<string>;
  english: Nullable<string>;
  native: Nullable<string>;
}

interface AniListCoverImage {
  large: Nullable<string>;
  extraLarge: Nullable<string>;
}

interface AniListFuzzyDate {
  year: Nullable<number>;
  month: Nullable<number>;
  day: Nullable<number>;
}

interface AniListMedia {
  id: number;
  title: AniListTitle;
  coverImage: Nullable<AniListCoverImage>;
  bannerImage: Nullable<string>;
  format: Nullable<string>;
  status: Nullable<string>;
  episodes: Nullable<number>;
  countryOfOrigin: Nullable<string>;
  season: Nullable<string>;
  seasonYear: Nullable<number>;
  averageScore: Nullable<number>;
  popularity: Nullable<number>;
  endDate?: Nullable<AniListFuzzyDate>;
  description?: Nullable<string>;
  genres?: Nullable<string[]>;
  siteUrl?: Nullable<string>;
}

interface AniListPageInfo {
  currentPage: number;
  hasNextPage: boolean;
  lastPage: number;
  total: number;
}

interface AniListGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; status?: number; hint?: string }>;
}

export interface AnimeCard {
  anilistId: number;
  title: string;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  countryOfOrigin: string | null;
  season: string | null;
  seasonYear: number | null;
  averageScore: number | null;
  popularity: number | null;
  latestEpisodeNumber?: number | null;
  latestEpisodeAt?: string | null;
  completedAt?: string | null;
}

export interface AnimeDetail extends AnimeCard {
  description: string | null;
  genres: string[];
  siteUrl: string | null;
}

export interface PaginatedAnimeCards {
  items: AnimeCard[];
  currentPage: number;
  hasNextPage: boolean;
  lastPage: number;
  total: number;
}

export const SEARCH_SORT_OPTIONS = [
  { value: "relevance", label: "Best match" },
  { value: "popularity", label: "Most popular" },
  { value: "score", label: "Highest score" },
  { value: "newest", label: "Newest" },
  { value: "title", label: "Title A-Z" },
] as const;

export type SearchSort = (typeof SEARCH_SORT_OPTIONS)[number]["value"];

const SEARCH_SORT_TO_ANILIST: Record<SearchSort, string[]> = {
  relevance: ["SEARCH_MATCH", "POPULARITY_DESC"],
  popularity: ["POPULARITY_DESC"],
  score: ["SCORE_DESC", "POPULARITY_DESC"],
  newest: ["START_DATE_DESC", "POPULARITY_DESC"],
  title: ["TITLE_ROMAJI"],
};

export class AniListError extends Error {
  code: "invalid_request" | "not_found" | "upstream_unavailable" | "rate_limited";
  status: number;
  retryable: boolean;

  constructor(
    code: AniListError["code"],
    message: string,
    status = 500,
    retryable = false,
  ) {
    super(message);
    this.name = "AniListError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function isAniListTemporarilyUnavailable(error: unknown): error is AniListError {
  return (
    error instanceof AniListError &&
    (error.code === "upstream_unavailable" || error.code === "rate_limited")
  );
}

const TRENDING_QUERY = `
  query TrendingAnime($page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
        total
      }
      media(type: ANIME, isAdult: false, sort: [TRENDING_DESC, POPULARITY_DESC]) {
        id
        title {
          romaji
          english
          native
        }
        coverImage {
          large
          extraLarge
        }
        bannerImage
        format
        status
        episodes
        countryOfOrigin
        season
        seasonYear
        averageScore
        popularity
      }
    }
  }
`;

const POPULAR_QUERY = `
  query PopularAnime($page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
        total
      }
      media(type: ANIME, isAdult: false, sort: [POPULARITY_DESC, SCORE_DESC]) {
        id
        title {
          romaji
          english
          native
        }
        coverImage {
          large
          extraLarge
        }
        bannerImage
        format
        status
        episodes
        countryOfOrigin
        season
        seasonYear
        averageScore
        popularity
      }
    }
  }
`;

const SEARCH_QUERY = `
  query SearchAnime($search: String!, $page: Int!, $perPage: Int!, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
        total
      }
      media(
        type: ANIME
        isAdult: false
        search: $search
        sort: $sort
      ) {
        id
        title {
          romaji
          english
          native
        }
        coverImage {
          large
          extraLarge
        }
        bannerImage
        format
        status
        episodes
        countryOfOrigin
        season
        seasonYear
        averageScore
        popularity
      }
    }
  }
`;

const DETAIL_QUERY = `
  query AnimeDetail($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      title {
        romaji
        english
        native
      }
      coverImage {
        large
        extraLarge
      }
      bannerImage
      format
      status
      episodes
      countryOfOrigin
      season
      seasonYear
      averageScore
      popularity
      description(asHtml: false)
      genres
      siteUrl
    }
  }
`;

const NEW_EPISODES_QUERY = `
  query NewEpisodesAnime($page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
        total
      }
      airingSchedules(notYetAired: false, sort: [TIME_DESC]) {
        episode
        airingAt
        media {
          id
          title {
            romaji
            english
            native
          }
          coverImage {
            large
            extraLarge
          }
          bannerImage
          format
          status
          episodes
          countryOfOrigin
          season
          seasonYear
          averageScore
          popularity
          endDate {
            year
            month
            day
          }
        }
      }
    }
  }
`;

const RECENTLY_COMPLETED_QUERY = `
  query RecentlyCompletedAnime($page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
        total
      }
      media(
        type: ANIME
        isAdult: false
        status: FINISHED
        sort: [END_DATE_DESC, POPULARITY_DESC]
      ) {
        id
        title {
          romaji
          english
          native
        }
        coverImage {
          large
          extraLarge
        }
        bannerImage
        format
        status
        episodes
        countryOfOrigin
        season
        seasonYear
        averageScore
        popularity
        endDate {
          year
          month
          day
        }
      }
    }
  }
`;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function sanitizeDescription(description: string | null | undefined): string | null {
  if (!description) {
    return null;
  }

  const sanitized = decodeHtmlEntities(
    description
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );

  return sanitized || null;
}

function normalizeTitle(title: AniListTitle): string {
  return title.english || title.romaji || title.native || "Untitled";
}

function normalizeFuzzyDate(value: Nullable<AniListFuzzyDate> | undefined): string | null {
  if (!value?.year || !value?.month || !value?.day) {
    return null;
  }

  const date = new Date(Date.UTC(value.year, value.month - 1, value.day, 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeCard(media: AniListMedia): AnimeCard {
  return {
    anilistId: media.id,
    title: normalizeTitle(media.title),
    titleEnglish: media.title.english,
    titleRomaji: media.title.romaji,
    titleNative: media.title.native,
    coverImage: media.coverImage?.extraLarge || media.coverImage?.large || null,
    bannerImage: media.bannerImage || null,
    format: media.format,
    status: media.status,
    episodes: media.episodes,
    countryOfOrigin: media.countryOfOrigin,
    season: media.season,
    seasonYear: media.seasonYear,
    averageScore: media.averageScore,
    popularity: media.popularity,
    latestEpisodeNumber: null,
    latestEpisodeAt: null,
    completedAt: normalizeFuzzyDate(media.endDate),
  };
}

function normalizeDetail(media: AniListMedia): AnimeDetail {
  return {
    ...normalizeCard(media),
    description: sanitizeDescription(media.description),
    genres: media.genres ?? [],
    siteUrl: media.siteUrl || null,
  };
}

async function anilistRequest<TData>(
  query: string,
  variables: Record<string, string | number | string[] | number[]>,
): Promise<TData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(ANILIST_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as AniListGraphQLResponse<TData>;

    if (response.status === 429) {
      throw new AniListError(
        "rate_limited",
        "AniList temporarily rate limited requests.",
        429,
        true,
      );
    }

    if (!response.ok) {
      throw new AniListError(
        "upstream_unavailable",
        "AniList is currently unavailable.",
        response.status,
        response.status >= 500,
      );
    }

    if (payload.errors?.length) {
      const firstError = payload.errors[0];
      const status = firstError?.status ?? 502;
      const message = firstError?.message || "AniList returned an error.";

      throw new AniListError(
        status === 404 ? "not_found" : "upstream_unavailable",
        message,
        status,
        status >= 500 || status === 403,
      );
    }

    if (!payload.data) {
      throw new AniListError(
        "upstream_unavailable",
        "AniList returned an empty response.",
        502,
        true,
      );
    }

    return payload.data;
  } catch (error) {
    if (error instanceof AniListError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AniListError(
        "upstream_unavailable",
        "AniList timed out before responding.",
        504,
        true,
      );
    }

    throw new AniListError(
      "upstream_unavailable",
      "AniList could not be reached.",
      502,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

const getTrendingAnimeCached = unstable_cache(
  async (page: number) => {
    const data = await anilistRequest<{
      Page: { media: AniListMedia[]; pageInfo: AniListPageInfo };
    }>(TRENDING_QUERY, {
      page,
      perPage: 18,
    });

    return {
      items: data.Page.media.map(normalizeCard),
      currentPage: data.Page.pageInfo.currentPage,
      hasNextPage: data.Page.pageInfo.hasNextPage,
      lastPage: data.Page.pageInfo.lastPage,
      total: data.Page.pageInfo.total,
    } satisfies PaginatedAnimeCards;
  },
  ["anilist-trending"],
  { revalidate: TRENDING_REVALIDATE_SECONDS },
);

const getPopularAnimeCached = unstable_cache(
  async (page: number) => {
    const data = await anilistRequest<{
      Page: { media: AniListMedia[]; pageInfo: AniListPageInfo };
    }>(POPULAR_QUERY, {
      page,
      perPage: 18,
    });

    return {
      items: data.Page.media.map(normalizeCard),
      currentPage: data.Page.pageInfo.currentPage,
      hasNextPage: data.Page.pageInfo.hasNextPage,
      lastPage: data.Page.pageInfo.lastPage,
      total: data.Page.pageInfo.total,
    } satisfies PaginatedAnimeCards;
  },
  ["anilist-popular"],
  { revalidate: POPULAR_REVALIDATE_SECONDS },
);

const getNewEpisodesAnimeCached = unstable_cache(
  async (batch: number) => {
    const pageSize = Math.max(12, batch * 12);
    const data = await anilistRequest<{
      Page: {
        pageInfo: AniListPageInfo;
        airingSchedules: Array<{
          episode: number | null;
          airingAt: number | null;
          media: AniListMedia | null;
        }>;
      };
    }>(NEW_EPISODES_QUERY, {
      page: 1,
      perPage: pageSize,
    });

    const seen = new Set<number>();
    const items = data.Page.airingSchedules
      .filter((entry): entry is { episode: number | null; airingAt: number | null; media: AniListMedia } => Boolean(entry.media))
      .filter((entry) => {
        if (seen.has(entry.media.id)) {
          return false;
        }

        seen.add(entry.media.id);
        return true;
      })
      .map((entry) => ({
        ...normalizeCard(entry.media),
        latestEpisodeNumber: entry.episode,
        latestEpisodeAt: entry.airingAt ? new Date(entry.airingAt * 1000).toISOString() : null,
      }));

    return {
      items,
      currentPage: batch,
      hasNextPage: data.Page.pageInfo.total > items.length,
      lastPage: Math.max(1, Math.ceil(data.Page.pageInfo.total / 12)),
      total: data.Page.pageInfo.total,
    } satisfies PaginatedAnimeCards;
  },
  ["anilist-new-episodes"],
  { revalidate: NEW_EPISODES_REVALIDATE_SECONDS },
);

const getRecentlyCompletedAnimeCached = unstable_cache(
  async (page: number) => {
    const data = await anilistRequest<{
      Page: { media: AniListMedia[]; pageInfo: AniListPageInfo };
    }>(RECENTLY_COMPLETED_QUERY, {
      page,
      perPage: 18,
    });

    return {
      items: data.Page.media.map(normalizeCard),
      currentPage: data.Page.pageInfo.currentPage,
      hasNextPage: data.Page.pageInfo.hasNextPage,
      lastPage: data.Page.pageInfo.lastPage,
      total: data.Page.pageInfo.total,
    } satisfies PaginatedAnimeCards;
  },
  ["anilist-recently-completed"],
  { revalidate: RECENTLY_COMPLETED_REVALIDATE_SECONDS },
);

const searchAnimeCached = unstable_cache(
  async (query: string, page: number, sort: SearchSort) => {
    const data = await anilistRequest<{
      Page: { media: AniListMedia[]; pageInfo: AniListPageInfo };
    }>(SEARCH_QUERY, {
      search: query,
      page,
      perPage: 18,
      sort: SEARCH_SORT_TO_ANILIST[sort],
    });

    return {
      items: data.Page.media.map(normalizeCard),
      currentPage: data.Page.pageInfo.currentPage,
      hasNextPage: data.Page.pageInfo.hasNextPage,
      lastPage: data.Page.pageInfo.lastPage,
      total: data.Page.pageInfo.total,
    } satisfies PaginatedAnimeCards;
  },
  ["anilist-search"],
  { revalidate: SEARCH_REVALIDATE_SECONDS },
);

const getAnimeDetailCached = unstable_cache(
  async (anilistId: number) => {
    const data = await anilistRequest<{
      Media: AniListMedia | null;
    }>(DETAIL_QUERY, {
      id: anilistId,
    });

    if (!data.Media) {
      return null;
    }

    return normalizeDetail(data.Media);
  },
  ["anilist-detail"],
  { revalidate: DETAIL_REVALIDATE_SECONDS },
);

export async function getTrendingAnime(page = 1): Promise<PaginatedAnimeCards> {
  return getTrendingAnimeCached(page);
}

export async function getPopularAnime(page = 1): Promise<PaginatedAnimeCards> {
  return getPopularAnimeCached(page);
}

export async function getNewEpisodesAnime(batch = 1): Promise<PaginatedAnimeCards> {
  return getNewEpisodesAnimeCached(batch);
}

export async function getRecentlyCompletedAnime(
  page = 1,
): Promise<PaginatedAnimeCards> {
  return getRecentlyCompletedAnimeCached(page);
}

export async function searchAnime(
  query: string,
  page = 1,
  sort: SearchSort = "relevance",
): Promise<PaginatedAnimeCards> {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");

  if (normalizedQuery.length < 2) {
    throw new AniListError(
      "invalid_request",
      "Search queries must contain at least 2 characters.",
      400,
      false,
    );
  }

  return searchAnimeCached(normalizedQuery, page, normalizeSearchSort(sort));
}

export function normalizeSearchSort(value: string | undefined): SearchSort {
  return SEARCH_SORT_OPTIONS.some((option) => option.value === value)
    ? (value as SearchSort)
    : "relevance";
}

export async function getAnimeDetail(
  anilistId: number,
): Promise<AnimeDetail | null> {
  if (!Number.isInteger(anilistId) || anilistId <= 0) {
    throw new AniListError(
      "invalid_request",
      "Anime identifiers must be positive integers.",
      400,
      false,
    );
  }

  return getAnimeDetailCached(anilistId);
}
