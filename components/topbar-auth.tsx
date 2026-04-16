"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabasePublicEnv } from "@/lib/env";

interface TopbarUserState {
  user: User | null;
  displayName: string | null;
  unreadCount: number;
}

function getPreferredDisplayName(user: User | null, displayName: string | null): string | null {
  if (displayName) {
    return displayName;
  }

  const metadataName =
    typeof user?.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : typeof user?.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user?.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null;

  return metadataName ?? user?.email ?? null;
}

export function TopbarAuth() {
  const [state, setState] = useState<TopbarUserState>({
    user: null,
    displayName: null,
    unreadCount: 0,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    const browserClient = supabase;

    let cancelled = false;

    async function loadUser() {
      const {
        data: { user },
      } = await browserClient.auth.getUser();

      if (!user || cancelled) {
        if (!cancelled) {
          setState({ user: null, displayName: null, unreadCount: 0 });
        }
        return;
      }

      const [{ data: profile }, { count: unreadCount }] = await Promise.all([
        browserClient
          .from("profiles")
          .select("display_name, username")
          .eq("id", user.id)
          .maybeSingle(),
        browserClient
          .from("user_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_read", false),
      ]);

      if (cancelled) {
        return;
      }

      const profileDisplayName =
        profile?.display_name && profile.display_name !== user.email
          ? profile.display_name
          : profile?.username ?? null;

      setState({
        user,
        displayName: getPreferredDisplayName(user, profileDisplayName),
        unreadCount: unreadCount ?? 0,
      });
    }

    void loadUser();

    const {
      data: { subscription },
    } = browserClient.auth.onAuthStateChange(() => {
      void loadUser();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (!hasSupabasePublicEnv()) {
    return <span className="topbarMeta">Sign in unavailable</span>;
  }

  if (!state.user) {
    return (
      <div className="topbarActions">
        <Link className="topbarButton ghost" href="/login">
          Login
        </Link>
        <Link className="topbarButton" href="/signup">
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="topbarActions">
      <Link className="topbarButton ghost notificationTopbarLink" href="/notifications">
        Notifications
        {state.unreadCount ? (
          <span className="topbarBadge">{state.unreadCount}</span>
        ) : null}
      </Link>
      <Link className="topbarButton ghost" href="/profile">
        {state.displayName || "Profile"}
      </Link>
      <button
        className="topbarButton"
        type="button"
        onClick={async () => {
          const supabase = createSupabaseBrowserClient();

          if (!supabase) {
            return;
          }

          await supabase.auth.signOut();
          window.location.assign("/");
        }}
      >
        Logout
      </button>
    </div>
  );
}
