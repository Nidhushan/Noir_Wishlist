import { redirect } from "next/navigation";

import { signInWithGoogleAction, signupWithPasswordAction } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { SetupNotice } from "@/components/setup-notice";
import { getCurrentAuthUser } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

interface SignupPageProps {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const user = await getCurrentAuthUser();

  if (user) {
    redirect("/profile");
  }

  const { error, message } = await searchParams;

  if (!hasSupabasePublicEnv()) {
    return <SetupNotice title="Signup is waiting on Supabase" />;
  }

  return (
    <AuthCard
      eyebrow="Signup"
      title="Create your Noir profile"
      description="Set up your account so saved anime and future list updates stay tied to your profile."
      mode="signup"
      error={error}
      message={message}
      googleAction={signInWithGoogleAction}
      emailAction={signupWithPasswordAction}
    />
  );
}
