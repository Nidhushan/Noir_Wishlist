"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  removeUserAnimeEntry,
  type UserListStatus,
  upsertUserAnimeEntry,
  updateUserAnimeStatus,
} from "@/lib/user-anime";

function getListStatus(formData: FormData): UserListStatus {
  const value = String(formData.get("listStatus") || "wishlist");

  if (
    value === "wishlist" ||
    value === "watching" ||
    value === "completed" ||
    value === "dropped"
  ) {
    return value;
  }

  return "wishlist";
}

export async function saveAnimeAction(formData: FormData) {
  const anilistId = Number(formData.get("anilistId"));
  const returnTo = String(formData.get("returnTo") || "/profile");
  const result = await upsertUserAnimeEntry({
    anilistId,
    listStatus: getListStatus(formData),
  });

  if (result.error) {
    redirect(`/login?error=${encodeURIComponent(result.error)}&next=${encodeURIComponent(returnTo)}`);
  }

  revalidatePath("/profile");
  revalidatePath(returnTo);
}

export async function updateUserAnimeStatusAction(formData: FormData) {
  const animeId = Number(formData.get("animeId"));
  const result = await updateUserAnimeStatus({
    animeId,
    listStatus: getListStatus(formData),
  });

  if (!result.error) {
    revalidatePath("/profile");
  }
}

export async function removeUserAnimeAction(formData: FormData) {
  const animeId = Number(formData.get("animeId"));
  const result = await removeUserAnimeEntry(animeId);

  if (!result.error) {
    revalidatePath("/profile");
  }
}
