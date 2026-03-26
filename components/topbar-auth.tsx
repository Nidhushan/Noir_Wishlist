import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";

export async function TopbarAuth() {
  const user = await getCurrentAppUser();

  if (!hasSupabasePublicEnv()) {
    return <span className="topbarMeta">Supabase setup pending</span>;
  }

  if (!user) {
    return (
      <div className="topbarActions">
        <Link className="topbarButton ghost" href="/login">
          Login
        </Link>
        <Link className="topbarButton" href="/signup">
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="topbarActions">
      <Link className="topbarButton ghost" href="/profile">
        {user.displayName || user.email || "Profile"}
      </Link>
      <form action={signOutAction}>
        <button className="topbarButton" type="submit">
          Logout
        </button>
      </form>
    </div>
  );
}
