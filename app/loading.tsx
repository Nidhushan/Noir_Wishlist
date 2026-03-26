import { SkeletonGrid } from "@/components/skeleton-grid";

export default function LoadingHome() {
  return (
    <main className="mainContent">
      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Trending-first anime discovery</p>
          <h1>Loading the latest anime picks.</h1>
          <p className="heroText">
            Pulling the current AniList feed and preparing the homepage.
          </p>
        </div>
      </section>

      <section className="sectionHeader">
        <div>
          <p className="eyebrow">Home feed</p>
          <h2>Trending Anime</h2>
        </div>
      </section>

      <SkeletonGrid />
    </main>
  );
}
