"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  removeUserAnimeEntry,
  type UserListStatus,
  upsertUserAnimeEntry,
  updateUserAnimeStatus,
} from "@/lib/user-anime";

export interface UserAnimeActionState {
  success: boolean;
  message: string | null;
}

const DEFAULT_ACTION_STATE: UserAnimeActionState = {
  success: false,
  message: null,
};

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

function getReturnTo(formData: FormData): string {
  const value = String(formData.get("returnTo") || "/profile");
  return value.startsWith("/") ? value : "/profile";
}

export async function saveAnimeAction(
  previousState: UserAnimeActionState = DEFAULT_ACTION_STATE,
  formData: FormData,
): Promise<UserAnimeActionState> {
  void previousState;
  const anilistId = Number(formData.get("anilistId"));
  const returnTo = getReturnTo(formData);
  const result = await upsertUserAnimeEntry({
    anilistId,
    listStatus: getListStatus(formData),
  });

  if (result.error) {
    if (result.error.includes("Please log in")) {
      redirect(`/login?error=${encodeURIComponent(result.error)}&next=${encodeURIComponent(returnTo)}`);
    }

    return {
      success: false,
      message: result.error,
    };
  }

  revalidatePath("/profile");
  revalidatePath(returnTo);

  return {
    success: true,
    message: "Library updated.",
  };
}

export async function updateUserAnimeStatusAction(
  previousState: UserAnimeActionState = DEFAULT_ACTION_STATE,
  formData: FormData,
): Promise<UserAnimeActionState> {
  void previousState;
  const animeId = Number(formData.get("animeId"));
  const returnTo = getReturnTo(formData);
  const result = await updateUserAnimeStatus({
    animeId,
    listStatus: getListStatus(formData),
  });

  if (result.error) {
    return {
      success: false,
      message: result.error,
    };
  }

  revalidatePath("/profile");
  revalidatePath(returnTo);

  return {
    success: true,
    message: "List status updated.",
  };
}

export async function removeUserAnimeAction(
  previousState: UserAnimeActionState = DEFAULT_ACTION_STATE,
  formData: FormData,
): Promise<UserAnimeActionState> {
  void previousState;
  const animeId = Number(formData.get("animeId"));
  const returnTo = getReturnTo(formData);
  const result = await removeUserAnimeEntry(animeId);

  if (result.error) {
    return {
      success: false,
      message: result.error,
    };
  }

  revalidatePath("/profile");
  revalidatePath(returnTo);

  return {
    success: true,
    message: "Removed from your library.",
  };
}
