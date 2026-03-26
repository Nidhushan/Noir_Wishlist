import { SEARCH_SORT_OPTIONS, type SearchSort } from "@/lib/anilist";

interface SearchFormProps {
  action?: string;
  initialQuery?: string;
  initialSort?: SearchSort;
  compact?: boolean;
}

export function SearchForm({
  action = "/search",
  initialQuery = "",
  initialSort = "relevance",
  compact = false,
}: SearchFormProps) {
  return (
    <form action={action} className={compact ? "searchForm compact" : "searchForm"}>
      <div className="searchFields">
        <label className="srOnly" htmlFor="anime-search">
          Search anime titles
        </label>
        <input
          id="anime-search"
          className="searchInput"
          type="search"
          name="q"
          minLength={2}
          defaultValue={initialQuery}
          placeholder="Search anime by English, Romaji, or native title"
        />

        <div className="searchControls">
          <label className="searchSelectWrap" htmlFor="anime-sort">
            <span className="searchSelectLabel">Sort</span>
            <select
              id="anime-sort"
              className="searchSelect"
              name="sort"
              defaultValue={initialSort}
            >
              {SEARCH_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button className="searchButton" type="submit">
            Search
          </button>
        </div>
      </div>
    </form>
  );
}
