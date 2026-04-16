import Link from "next/link";
import { redirect } from "next/navigation";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import { CatalogImage } from "@/components/catalog-image";
import { SetupNotice } from "@/components/setup-notice";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";
import {
  getCurrentUserNotifications,
  type NotificationType,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

const SECTION_LABELS: Record<NotificationType, string> = {
  new_episode: "New Episodes",
  anime_completed: "Finished Airing",
};

function formatNotificationTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function NotificationsPage() {
  if (!hasSupabasePublicEnv()) {
    return (
      <main className="mainContent">
        <SetupNotice title="Notifications are waiting on Supabase" />
      </main>
    );
  }

  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/login");
  }

  const notifications = (await getCurrentUserNotifications()) ?? [];
  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const grouped = {
    new_episode: notifications.filter((item) => item.type === "new_episode"),
    anime_completed: notifications.filter((item) => item.type === "anime_completed"),
  } satisfies Record<NotificationType, typeof notifications>;

  return (
    <main className="mainContent">
      <section className="hero compactHero">
        <div className="heroCopy">
          <p className="eyebrow">Notifications</p>
          <h1>{unreadCount ? `${unreadCount} unread` : "All caught up"}</h1>
          <p className="heroText">
            Track new episode drops and completed anime for titles in your wishlist and watching list.
          </p>
        </div>
        <div className="profileSummary">
          <p className="profileSummaryLabel">Inbox</p>
          <p className="profileSummaryValue">{notifications.length} total</p>
          <form action={markAllNotificationsReadAction}>
            <input type="hidden" name="returnTo" value="/notifications" />
            <button className="paginationButton" type="submit">
              Mark all read
            </button>
          </form>
        </div>
      </section>

      {notifications.length ? (
        Object.entries(grouped).map(([type, items]) => (
          <section key={type} className="detailPanel notificationPanel">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Notifications</p>
                <h2>{SECTION_LABELS[type as NotificationType]}</h2>
              </div>
              <p className="sectionMeta">{items.length} total</p>
            </div>

            {items.length ? (
              <div className="notificationList">
                {items.map((notification) => {
                  const animeHref = notification.anime?.anilistId
                    ? `/anime/${notification.anime.anilistId}`
                    : null;

                  return (
                    <article
                      key={notification.id}
                      className={`notificationCard${notification.isRead ? "" : " unread"}`}
                    >
                      <div className="notificationMedia">
                        <CatalogImage
                          src={notification.anime?.coverImage}
                          alt={`${notification.anime?.titleDisplay || "Anime"} cover art`}
                          sizes="120px"
                          className="animeCardImage"
                        />
                      </div>

                      <div className="notificationBody">
                        <div className="notificationHeader">
                          <div>
                            <p className="notificationType">{notification.title}</p>
                            <h3 className="notificationTitle">
                              {animeHref ? (
                                <Link href={animeHref}>{notification.anime?.titleDisplay || "Anime"}</Link>
                              ) : (
                                notification.anime?.titleDisplay || "Anime"
                              )}
                            </h3>
                          </div>
                          {!notification.isRead ? (
                            <span className="notificationUnreadBadge">Unread</span>
                          ) : null}
                        </div>

                        <p className="notificationMessage">{notification.message}</p>

                        <div className="notificationFooter">
                          <span className="notificationTimestamp">
                            {formatNotificationTime(notification.createdAt)}
                          </span>
                          {!notification.isRead ? (
                            <form action={markNotificationReadAction}>
                              <input type="hidden" name="notificationId" value={notification.id} />
                              <input type="hidden" name="returnTo" value="/notifications" />
                              <button className="smallActionButton" type="submit">
                                Mark read
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="emptyState compactEmptyState">
                <h2>Nothing here yet</h2>
                <p>New updates for this notification type will appear here.</p>
              </div>
            )}
          </section>
        ))
      ) : (
        <section className="emptyState">
          <h2>No notifications yet</h2>
          <p>
            Add anime to your wishlist or watching list and Noir will let you know about new
            episodes and completed series.
          </p>
        </section>
      )}
    </main>
  );
}
