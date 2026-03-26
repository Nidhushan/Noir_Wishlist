export function formatSeason(season: string | null, year: number | null): string {
  if (!season && !year) {
    return "Unknown season";
  }

  if (!season) {
    return String(year);
  }

  const normalizedSeason =
    season.charAt(0).toUpperCase() + season.slice(1).toLowerCase();

  return year ? `${normalizedSeason} ${year}` : normalizedSeason;
}

export function formatEpisodes(episodes: number | null): string {
  if (!episodes) {
    return "TBA";
  }

  return `${episodes} ep${episodes === 1 ? "" : "s"}`;
}

export function formatStatus(status: string | null): string {
  if (!status) {
    return "Status unknown";
  }

  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatScore(score: number | null): string {
  if (!score) {
    return "Unscored";
  }

  return `${score}%`;
}

export function formatPopularity(popularity: number | null): string {
  if (!popularity) {
    return "Popularity unavailable";
  }

  return popularity.toLocaleString();
}

export function formatCountry(countryCode: string | null): string {
  if (!countryCode) {
    return "Global";
  }

  switch (countryCode) {
    case "JP":
      return "Japan";
    case "CN":
      return "China";
    case "KR":
      return "South Korea";
    default:
      return countryCode;
  }
}
