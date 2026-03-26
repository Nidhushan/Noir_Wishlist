export default function LoadingAnimeDetail() {
  return (
    <main className="mainContent">
      <section className="detailHero">
        <div className="detailHeroContent">
          <div className="detailPoster skeletonMedia" />
          <div className="detailSummary">
            <p className="eyebrow">AniList detail view</p>
            <div className="skeletonLine short" />
            <div className="skeletonLine" />
            <div className="skeletonLine medium" />
            <div className="skeletonLine" />
          </div>
        </div>
      </section>
    </main>
  );
}
