"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="mainContent">
          <section className="statusPanel error">
            <p className="eyebrow">Unexpected error</p>
            <h1>Something broke while rendering the site.</h1>
            <p>
              The page did not complete successfully. Retry once, then inspect
              the server logs if the problem continues.
            </p>
            <div className="buttonRow">
              <button className="paginationButton" onClick={() => reset()} type="button">
                Try again
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
