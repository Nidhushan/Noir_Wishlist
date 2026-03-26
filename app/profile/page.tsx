import Link from "next/link";
import { redirect } from "next/navigation";

import { SetupNotice } from "@/components/setup-notice";
import { UserAnimeCard } from "@/components/user-anime-card";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getCurrentUserAnimeByStatus } from "@/lib/user-anime";

export const dynamic = "force-dynamic";

const SECTION_LABELS: Record<string, string> = {
  wishlist: "Wishlist",
  watching: "Watching",
  completed: "Completed",
  dropped: "Dropped",
};

export default async function ProfilePage() {
  if (!hasSupabasePublicEnv()) {
    return (
      <main className="mainContent">
        <SetupNotice title="Profile is waiting on Supabase" />
      </main>
    );
  }

  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/login");
  }

  const sections = await getCurrentUserAnimeByStatus();

  return (
    <main className="mainContent">
      <section className="hero compactHero">
        <div className="heroCopy">
          <p className="eyebrow">Profile</p>
          <h1>{user.displayName || user.email || "Your library"}</h1>
          <p className="heroText">
            Your saved anime lives here, grouped by list status and backed by the shared Noir catalog.
          </p>
        </div>
        <div className="profileSummary">
          <p className="profileSummaryLabel">Account</p>
          <p className="profileSummaryValue">{user.email || "Email unavailable"}</p>
          <Link className="paginationButton" href="/search">
            Find more anime
          </Link>
        </div>
      </section>

      {sections?.map((section) => (
        <section key={section.status} className="detailPanel">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Library</p>
              <h2>{SECTION_LABELS[section.status]}</h2>
            </div>
            <p className="sectionMeta">{section.items.length} saved</p>
          </div>

          {section.items.length ? (
            <div className="savedAnimeGrid">
              {section.items.map((item) => (
                <UserAnimeCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="emptyState">
              <h2>Nothing here yet</h2>
              <p>Search for anime and save titles to start filling this section.</p>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
