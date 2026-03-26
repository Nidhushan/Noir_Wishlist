import { SkeletonGrid } from "@/components/skeleton-grid";

export default function LoadingSearch() {
  return (
    <main className="mainContent">
      <section className="hero compactHero">
        <div className="heroCopy">
          <p className="eyebrow">Search</p>
          <h1>Loading search results.</h1>
          <p className="heroText">
            Fetching AniList search results and preparing the result grid.
          </p>
        </div>
      </section>
      <SkeletonGrid />
    </main>
  );
}
