import { NextResponse } from "next/server";

import { syncProfileForCurrentUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/profile";

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=Supabase+is+not+configured+yet.", getSiteUrl()));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      await syncProfileForCurrentUser();
      return NextResponse.redirect(new URL(next, getSiteUrl()));
    }
  }

  return NextResponse.redirect(new URL("/login?error=Authentication+could+not+be+completed.", getSiteUrl()));
}
