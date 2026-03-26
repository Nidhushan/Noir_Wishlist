"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSiteUrlFromHeaders } from "@/lib/env";
import { syncProfileForCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function loginRedirect(target: string, error?: string): never {
  const params = new URLSearchParams();

  if (error) {
    params.set("error", error);
  }

  redirect(params.size ? `${target}?${params.toString()}` : target);
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
  const siteUrl = getSiteUrlFromHeaders(await headers());

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    loginRedirect("/signup", error.message);
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
