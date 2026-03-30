"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  removeUserAnimeAction,
  type UserAnimeActionState,
  updateUserAnimeStatusAction,
} from "@/app/actions/user-anime";
import { CatalogImage } from "@/components/catalog-image";
import { USER_LIST_STATUSES, type UserAnimeRow } from "@/lib/user-anime.types";

import { ActionFeedback } from "./action-feedback";
import { ActionSubmitButton } from "./action-submit-button";

const INITIAL_STATE: UserAnimeActionState = {
  success: false,
  message: null,
};

interface UserAnimeCardProps {
  item: UserAnimeRow;
  returnTo?: string;
}

function formatListStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function UserAnimeCard({ item, returnTo = "/profile" }: UserAnimeCardProps) {
  const [statusState, statusAction] = useActionState(updateUserAnimeStatusAction, INITIAL_STATE);
  const [removeState, removeAction] = useActionState(removeUserAnimeAction, INITIAL_STATE);
  const detailHref = item.anime?.anilist_id ? `/anime/${item.anime.anilist_id}` : null;

  return (
    <article className="savedAnimeCard">
      <div className="savedAnimeMedia">
        {detailHref ? <Link className="savedAnimeMediaLink" href={detailHref} aria-label={`Open ${item.anime?.title_display || "anime"} detail page`} /> : null}
        <CatalogImage
          src={item.anime?.cover_image}
          alt={`${item.anime?.title_display || "Anime"} cover art`}
          sizes="(max-width: 768px) 50vw, 180px"
          className="animeCardImage"
        />
      </div>

      <div className="savedAnimeBody">
        <div className="savedAnimeHeader">
          <p className="savedAnimeLabel">{formatListStatus(item.list_status)}</p>
          {detailHref ? (
            <Link className="savedAnimeTitleLink" href={detailHref}>
              <h3 className="savedAnimeTitle">
                {item.anime?.title_display || `Catalog item #${item.anime_id}`}
              </h3>
            </Link>
          ) : (
            <h3 className="savedAnimeTitle">{item.anime?.title_display || `Catalog item #${item.anime_id}`}</h3>
          )}
          <p className="savedAnimeMeta">
            {item.score ? `Score ${item.score}` : "Saved to your library"}
          </p>
        </div>

        <div className="savedAnimeActions">
          <form action={statusAction} className="savedAnimeInline">
            <input type="hidden" name="animeId" value={item.anime_id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="savedAnimeField">
              <span>Move to</span>
              <select className="searchSelect" name="listStatus" defaultValue={item.list_status}>
                {USER_LIST_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatListStatus(status)}
                  </option>
                ))}
              </select>
            </label>
            <ActionSubmitButton
              className="smallActionButton"
              idleLabel="Update"
              pendingLabel="Saving..."
            />
          </form>
          {statusState.message ? (
            <ActionFeedback compact message={statusState.message} success={statusState.success} />
          ) : null}

          <form action={removeAction} className="savedAnimeInline end">
            <input type="hidden" name="animeId" value={item.anime_id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <ActionSubmitButton
              className="smallActionButton ghostDanger"
              idleLabel="Remove"
              pendingLabel="Removing..."
            />
          </form>
          {removeState.message ? (
            <ActionFeedback compact message={removeState.message} success={removeState.success} />
          ) : null}
        </div>
      </div>
    </article>
  );
}
