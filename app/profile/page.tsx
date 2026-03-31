import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
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
    page?: string;
  }>;
}

function normalizePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildProfileHref(status: UserListStatus, page: number): string {
  const params = new URLSearchParams();
  params.set("list", status);

  if (page > 1) {
    params.set("page", String(page));
  }

  return `/profile?${params.toString()}`;
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

  const { list, page } = await searchParams;
  const activeStatus = normalizeListStatus(list);
  const currentPage = normalizePage(page);
  const section = await getCurrentUserAnimeSection(activeStatus, currentPage);
  const items = section?.items ?? [];
  const returnTo = buildProfileHref(activeStatus, currentPage);

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
              href={buildProfileHref(status, 1)}
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
          <p className="sectionMeta">
            {section?.total ?? 0} saved
          </p>
        </div>

        {items.length ? (
          <>
            <div className="savedAnimeGrid">
            {items.map((item) => (
              <UserAnimeCard key={item.id} item={item} returnTo={returnTo} />
            ))}
            </div>
            <Pagination
              currentPage={section?.currentPage ?? currentPage}
              hasNextPage={section?.hasNextPage ?? false}
              buildHref={(nextPage) => buildProfileHref(activeStatus, nextPage)}
            />
          </>
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
