import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  hasNextPage: boolean;
  buildHref: (page: number) => string;
}

function getPageItems(
  currentPage: number,
  hasNextPage: boolean,
): Array<number | "ellipsis"> {
  const pages = new Set<number>([1]);

  for (let page = Math.max(1, currentPage - 2); page <= currentPage; page += 1) {
    pages.add(page);
  }

  if (hasNextPage) {
    pages.add(currentPage + 1);
  }

  const orderedPages = Array.from(pages)
    .filter((page) => page >= 1)
    .sort((first, second) => first - second);
  const items: Array<number | "ellipsis"> = [];

  orderedPages.forEach((page, index) => {
    const previousPage = orderedPages[index - 1];

    if (previousPage && page - previousPage > 1) {
      items.push("ellipsis");
    }

    items.push(page);
  });

  return items;
}

export function Pagination({ currentPage, hasNextPage, buildHref }: PaginationProps) {
  if (currentPage <= 1 && !hasNextPage) {
    return null;
  }

  const previousHref = currentPage > 1 ? buildHref(currentPage - 1) : null;
  const nextHref = hasNextPage ? buildHref(currentPage + 1) : null;
  const pageItems = getPageItems(currentPage, hasNextPage);

  return (
    <nav className="pagination" aria-label="Pagination">
      <div className="paginationSummary">
        {previousHref ? (
          <Link className="paginationButton" href={previousHref}>
            Previous
          </Link>
        ) : (
          <span className="paginationButton disabled">Previous</span>
        )}

        <span className="paginationLabel">
          Page {currentPage}
        </span>

        {nextHref ? (
          <Link className="paginationButton" href={nextHref}>
            Next
          </Link>
        ) : (
          <span className="paginationButton disabled">Next</span>
        )}
      </div>

      <div className="paginationPages" aria-label="Page list">
        {pageItems.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="paginationEllipsis" aria-hidden="true">
              ...
            </span>
          ) : item === currentPage ? (
            <span key={item} className="paginationPage active" aria-current="page">
              {item}
            </span>
          ) : (
            <Link key={item} className="paginationPage" href={buildHref(item)}>
              {item}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
