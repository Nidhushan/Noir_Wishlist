interface SkeletonGridProps {
  count?: number;
}

export function SkeletonGrid({ count = 6 }: SkeletonGridProps) {
  return (
    <section className="animeGrid" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="animeCard skeletonCard">
          <div className="skeletonMedia" />
          <div className="animeCardBody">
            <div className="skeletonLine short" />
            <div className="skeletonLine" />
            <div className="skeletonLine medium" />
          </div>
        </div>
      ))}
    </section>
  );
}
