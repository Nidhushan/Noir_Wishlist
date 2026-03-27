"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSiteUrlFromHeaders } from "@/lib/env";
import { syncProfileForCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function loginRedirect(target: string, error?: string): never {
  const params = new URLSearchParams();

  if (error) {
    params.set("error", error);
  }

  redirect(params.size ? `${target}?${params.toString()}` : target);
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function validateUsername(value: string): string | null {
  if (!value) {
    return "Name is required.";
  }

  if (!/^[a-z0-9_]+$/.test(value)) {
    return "Name can only use lowercase letters, numbers, and underscores.";
  }

  if (value.length < 3 || value.length > 10) {
    return "Name must be between 3 and 10 characters.";
  }

  return null;
}

async function isUsernameTaken(username: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return false;
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .limit(1)
    .maybeSingle();

  return Boolean(data) && !error;
}

export async function loginWithPasswordAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    loginRedirect("/login", "Supabase is not configured yet.");
  }

  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginRedirect("/login", error.message);
  }

  await syncProfileForCurrentUser();
  redirect("/profile");
}

export async function signupWithPasswordAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    loginRedirect("/signup", "Supabase is not configured yet.");
  }

  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const username = normalizeUsername(String(formData.get("username") || ""));
  const siteUrl = getSiteUrlFromHeaders(await headers());
  const usernameError = validateUsername(username);

  if (usernameError) {
    loginRedirect("/signup", usernameError);
  }

  if (await isUsernameTaken(username)) {
    loginRedirect("/signup", "That name is already taken.");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: {
        username,
        display_name: username,
      },
    },
  });

  if (error) {
    loginRedirect("/signup", error.message);
  }

  const userId = data.user?.id;
  const admin = createSupabaseAdminClient();

  if (userId && admin) {
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        username,
        display_name: username,
        email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (profileError) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      loginRedirect(
        "/signup",
        profileError.code === "23505"
          ? "That name is already taken."
          : "Your profile could not be created.",
      );
    }
  }

  redirect("/login?message=Check+your+email+to+finish+signing+up.");
}

export async function signInWithGoogleAction() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    loginRedirect("/login", "Supabase is not configured yet.");
  }

  const siteUrl = getSiteUrlFromHeaders(await headers());

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error || !data.url) {
    loginRedirect("/login", error?.message || "Google login could not be started.");
  }

  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/");
  }

  await supabase.auth.signOut();
  redirect("/");
}
