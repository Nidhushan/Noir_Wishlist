"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  type UserAnimeActionState,
  saveAnimeAction,
} from "@/app/actions/user-anime";
import { USER_LIST_STATUSES, type UserListStatus } from "@/lib/user-anime.types";

import { ActionFeedback } from "./action-feedback";
import { ActionSubmitButton } from "./action-submit-button";

const INITIAL_STATE: UserAnimeActionState = {
  success: false,
  message: null,
};

const COMPACT_STATUS_LABELS: Record<UserListStatus, string> = {
  wishlist: "Wish",
  watching: "Watch",
  completed: "Done",
  dropped: "Drop",
};

interface SaveAnimeFormProps {
  anilistId: number;
  returnTo: string;
  listStatus?: UserListStatus;
  currentStatus?: UserListStatus | null;
  authenticated?: boolean;
  compact?: boolean;
}

export function SaveAnimeForm({
  anilistId,
  returnTo,
  listStatus = "wishlist",
  currentStatus = null,
  authenticated = false,
  compact = false,
}: SaveAnimeFormProps) {
  const [state, formAction] = useActionState(saveAnimeAction, INITIAL_STATE);
  const initialStatus = currentStatus || listStatus;

  if (!authenticated) {
    return (
      <div className={compact ? "saveAnimeForm compact" : "saveAnimeForm"}>
        <Link
          className={compact ? "smallActionButton" : "paginationButton"}
          href={`/login?next=${encodeURIComponent(returnTo)}`}
        >
          Log in to save
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className={compact ? "saveAnimeForm compact" : "saveAnimeForm"}>
      <input type="hidden" name="anilistId" value={anilistId} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <div className="saveAnimeControls">
        <label className="saveAnimeStatus">
          <span className="srOnly">Choose list status</span>
          <select className="searchSelect" name="listStatus" defaultValue={initialStatus}>
            {USER_LIST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {compact ? COMPACT_STATUS_LABELS[status] : status}
              </option>
            ))}
          </select>
        </label>

        <ActionSubmitButton
          className={compact ? "smallActionButton" : "paginationButton"}
          idleLabel={currentStatus ? "Update" : "Save"}
          pendingLabel={currentStatus ? "Updating..." : "Saving..."}
        />
      </div>

      {!compact ? (
        currentStatus ? (
          <p className="saveAnimeSummary">Currently in {currentStatus}.</p>
        ) : (
          <p className="saveAnimeSummary">Add this anime to your library.</p>
        )
      ) : null}

      {state.message ? (
        <ActionFeedback compact={compact} message={state.message} success={state.success} />
      ) : null}
    </form>
  );
}
