import Image from "next/image";

import { removeUserAnimeAction, updateUserAnimeStatusAction } from "@/app/actions/user-anime";
import { USER_LIST_STATUSES, type UserAnimeRow } from "@/lib/user-anime";

interface UserAnimeCardProps {
  item: UserAnimeRow;
}

export function UserAnimeCard({ item }: UserAnimeCardProps) {
  return (
    <article className="savedAnimeCard">
      <div className="savedAnimeMedia">
        {item.anime?.cover_image ? (
          <Image
            src={item.anime.cover_image}
            alt={`${item.anime.title_display} cover art`}
            fill
            sizes="120px"
            className="animeCardImage"
          />
        ) : (
          <div className="animeCardPlaceholder">No cover available</div>
        )}
      </div>

      <div className="savedAnimeBody">
        <div>
          <p className="savedAnimeLabel">{item.list_status}</p>
          <h3 className="savedAnimeTitle">
            {item.anime?.title_display || `Catalog item #${item.anime_id}`}
          </h3>
          <p className="savedAnimeMeta">
            Progress {item.progress} · {item.score ? `Score ${item.score}` : "No score"}
          </p>
        </div>

        <div className="savedAnimeActions">
          <form action={updateUserAnimeStatusAction} className="savedAnimeInline">
            <input type="hidden" name="animeId" value={item.anime_id} />
            <label className="savedAnimeField">
              <span>Move to</span>
              <select className="searchSelect" name="listStatus" defaultValue={item.list_status}>
                {USER_LIST_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <button className="smallActionButton" type="submit">
              Update
            </button>
          </form>

          <form action={removeUserAnimeAction}>
            <input type="hidden" name="animeId" value={item.anime_id} />
            <button className="smallActionButton ghostDanger" type="submit">
              Remove
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
