import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mainContent">
      <section className="statusPanel">
        <p className="eyebrow">404</p>
        <h1>That anime page does not exist.</h1>
        <p>
          The page could not be found, or this title is not available right now.
        </p>
        <div className="buttonRow">
          <Link className="paginationButton" href="/">
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
