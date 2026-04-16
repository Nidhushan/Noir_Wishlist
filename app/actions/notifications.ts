"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  markAllNotificationsRead,
  markNotificationRead,
  updateCurrentUserNotificationPreferences,
} from "@/lib/notifications";

function getReturnTo(formData: FormData, fallback = "/notifications"): string {
  const value = String(formData.get("returnTo") || fallback);
  return value.startsWith("/") ? value : fallback;
}

export async function markNotificationReadAction(formData: FormData) {
  const notificationId = Number(formData.get("notificationId"));
  const returnTo = getReturnTo(formData);

  if (Number.isInteger(notificationId) && notificationId > 0) {
    await markNotificationRead(notificationId);
  }

  revalidatePath("/notifications");
  revalidatePath("/profile");
  redirect(returnTo);
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const returnTo = getReturnTo(formData);
  await markAllNotificationsRead();
  revalidatePath("/notifications");
  redirect(returnTo);
}

export async function updateNotificationPreferencesAction(formData: FormData) {
  const returnTo = getReturnTo(formData, "/profile");

  await updateCurrentUserNotificationPreferences({
    newEpisodeEnabled: formData.get("newEpisodeEnabled") === "on",
    animeCompletedEnabled: formData.get("animeCompletedEnabled") === "on",
  });

  revalidatePath("/profile");
  revalidatePath("/notifications");
  redirect(returnTo);
}
