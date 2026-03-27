import type { Database } from "@/lib/supabase/database.types";

export const USER_LIST_STATUSES = [
  "wishlist",
  "watching",
  "completed",
  "dropped",
] as const;

export type UserListStatus = (typeof USER_LIST_STATUSES)[number];

export interface UserAnimeState {
  animeId: number;
  anilistId: number;
  listStatus: UserListStatus;
  progress: number;
  score: number | null;
  updatedAt: string;
}

export type UserAnimeCatalogRecord = Database["public"]["Tables"]["anime"]["Row"];
export type UserAnimeBaseRow = Database["public"]["Tables"]["user_anime"]["Row"];

export interface UserAnimeRow extends UserAnimeBaseRow {
  anime: UserAnimeCatalogRecord | null;
}
