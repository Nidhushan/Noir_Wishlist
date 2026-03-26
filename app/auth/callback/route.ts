import { NextResponse } from "next/server";

import { syncProfileForCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getSafeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/profile";
  }

  return next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeNextPath(url.searchParams.get("next"));
  const siteUrl = url.origin;

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=Supabase+is+not+configured+yet.", siteUrl));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      await syncProfileForCurrentUser();
      return NextResponse.redirect(new URL(next, siteUrl));
    }
  }

  return NextResponse.redirect(new URL("/login?error=Authentication+could+not+be+completed.", siteUrl));
}
