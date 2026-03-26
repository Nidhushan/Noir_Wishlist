import { saveAnimeAction } from "@/app/actions/user-anime";

import type { UserListStatus } from "@/lib/user-anime";

interface SaveAnimeFormProps {
  anilistId: number;
  returnTo: string;
  listStatus?: UserListStatus;
  compact?: boolean;
}

export function SaveAnimeForm({
  anilistId,
  returnTo,
  listStatus = "wishlist",
  compact = false,
}: SaveAnimeFormProps) {
  return (
    <form action={saveAnimeAction} className={compact ? "inlineForm" : undefined}>
      <input type="hidden" name="anilistId" value={anilistId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="listStatus" value={listStatus} />
      <button className={compact ? "smallActionButton" : "paginationButton"} type="submit">
        Save to wishlist
      </button>
    </form>
  );
}
