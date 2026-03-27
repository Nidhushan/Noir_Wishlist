"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  type UserAnimeActionState,
  saveAnimeAction,
} from "@/app/actions/user-anime";
import { USER_LIST_STATUSES, type UserListStatus } from "@/lib/user-anime.types";

import { ActionFeedback } from "./action-feedback";

const INITIAL_STATE: UserAnimeActionState = {
  success: false,
  message: null,
};

interface AnimeCardMenuProps {
  anilistId: number;
  returnTo: string;
  authenticated: boolean;
  currentStatus?: UserListStatus | null;
}

function getMenuLabel(status: UserListStatus): string {
  switch (status) {
    case "wishlist":
      return "Add to wishlist";
    case "watching":
      return "Move to watching";
    case "completed":
      return "Mark completed";
    case "dropped":
      return "Mark dropped";
  }
}

export function AnimeCardMenu({
  anilistId,
  returnTo,
  authenticated,
  currentStatus = null,
}: AnimeCardMenuProps) {
  const [state, formAction] = useActionState(saveAnimeAction, INITIAL_STATE);

  return (
    <details className="animeCardMenu">
      <summary
        className={`animeCardMenuButton${currentStatus ? " active" : ""}`}
        aria-label="Open library actions"
      >
        <span />
        <span />
        <span />
      </summary>

      <div className="animeCardMenuPanel">
        {authenticated ? (
          <form action={formAction} className="animeCardMenuList">
            <input type="hidden" name="anilistId" value={anilistId} />
            <input type="hidden" name="returnTo" value={returnTo} />

            {USER_LIST_STATUSES.map((status) => (
              <button
                key={status}
                className={`animeCardMenuItem${currentStatus === status ? " active" : ""}`}
                name="listStatus"
                type="submit"
                value={status}
              >
                {getMenuLabel(status)}
              </button>
            ))}
          </form>
        ) : (
          <div className="animeCardMenuList">
            <Link className="animeCardMenuItem" href={`/login?next=${encodeURIComponent(returnTo)}`}>
              Log in to save
            </Link>
          </div>
        )}

        {state.message ? (
          <ActionFeedback compact message={state.message} success={state.success} />
        ) : null}
      </div>
    </details>
  );
}
