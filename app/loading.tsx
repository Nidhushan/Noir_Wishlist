import { SkeletonGrid } from "@/components/skeleton-grid";

export default function LoadingHome() {
  return (
    <main className="mainContent">
      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Noir</p>
          <h1>Loading the homepage.</h1>
          <p className="heroText">Preparing your anime feed.</p>
        </div>
      </section>

      <section className="sectionHeader">
        <div>
          <p className="eyebrow">Home feed</p>
          <h2>Anime</h2>
        </div>
      </section>

      <SkeletonGrid />
    </main>
  );
}
