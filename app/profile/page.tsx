import Link from "next/link";
import { redirect } from "next/navigation";

import { SetupNotice } from "@/components/setup-notice";
import { UserAnimeCard } from "@/components/user-anime-card";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";
import {
  getCurrentUserAnimeSection,
  USER_LIST_STATUSES,
  type UserListStatus,
} from "@/lib/user-anime";

export const dynamic = "force-dynamic";

const SECTION_LABELS: Record<string, string> = {
  wishlist: "Wishlist",
  watching: "Watching",
  completed: "Completed",
  dropped: "Dropped",
};

function normalizeListStatus(value: string | undefined): UserListStatus {
  if (value === "wishlist" || value === "watching" || value === "completed" || value === "dropped") {
    return value;
  }

  return "wishlist";
}

interface ProfilePageProps {
  searchParams: Promise<{
    list?: string;
  }>;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
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

  const { list } = await searchParams;
  const activeStatus = normalizeListStatus(list);
  const items = await getCurrentUserAnimeSection(activeStatus);
  const returnTo = `/profile?list=${activeStatus}`;

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

      <section className="detailPanel">
        <div className="profileNav" aria-label="Library sections">
          {USER_LIST_STATUSES.map((status) => (
            <Link
              key={status}
              className={`profileNavLink${status === activeStatus ? " active" : ""}`}
              href={`/profile?list=${status}`}
            >
              {SECTION_LABELS[status]}
            </Link>
          ))}
        </div>

        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Library</p>
            <h2>{SECTION_LABELS[activeStatus]}</h2>
          </div>
          <p className="sectionMeta">{items?.length ?? 0} saved</p>
        </div>

        {items?.length ? (
          <div className="savedAnimeGrid">
            {items.map((item) => (
              <UserAnimeCard key={item.id} item={item} returnTo={returnTo} />
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <h2>Nothing here yet</h2>
            <p>Search for anime and save titles to start filling this section.</p>
          </div>
        )}
      </section>
    </main>
  );
}
