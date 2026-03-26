import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mainContent">
      <section className="statusPanel">
        <p className="eyebrow">404</p>
        <h1>That anime page does not exist.</h1>
        <p>
          The AniList identifier may be invalid, or the title is not currently
          available through the public API.
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
