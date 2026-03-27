import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AppUser {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

export async function getCurrentAuthUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function syncProfileForCurrentUser() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const metadataUsername =
    typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username
      : null;
  const metadataDisplayName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null;
  const metadataAvatarUrl =
    typeof user.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : null;

  await supabase.from("profiles").upsert(
    {
      id: user.id,
      username: existingProfile?.username ?? metadataUsername,
      email: user.email ?? null,
      display_name:
        metadataDisplayName ??
        existingProfile?.display_name ??
        existingProfile?.username ??
        metadataUsername,
      avatar_url: metadataAvatarUrl ?? existingProfile?.avatar_url ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();

  const metadataDisplayName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null;
  const preferredDisplayName =
    profile?.display_name && profile.display_name !== user.email
      ? profile.display_name
      : profile?.username ?? null;

  return {
    id: user.id,
    username: profile?.username ?? null,
    email: user.email ?? null,
    displayName:
      preferredDisplayName ??
      metadataDisplayName ??
      profile?.display_name ??
      profile?.username ??
      null,
    avatarUrl:
      profile?.avatar_url ??
      (typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : null),
    role: profile?.role ?? "user",
  };
}
