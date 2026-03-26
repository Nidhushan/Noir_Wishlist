import { redirect } from "next/navigation";

import { loginWithPasswordAction, signInWithGoogleAction } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { SetupNotice } from "@/components/setup-notice";
import { getCurrentAuthUser } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentAuthUser();

  if (user) {
    redirect("/profile");
  }

  const { error, message } = await searchParams;

  if (!hasSupabasePublicEnv()) {
    return <SetupNotice title="Login is waiting on Supabase" />;
  }

  return (
    <AuthCard
      eyebrow="Login"
      title="Enter Noir"
      description="Sign in to save anime, organize your lists, and keep your catalog growing as you browse."
      mode="login"
      error={error}
      message={message}
      googleAction={signInWithGoogleAction}
      emailAction={loginWithPasswordAction}
    />
  );
}
