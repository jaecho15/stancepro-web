"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInternalAuth } from "@/hooks/useInternalAuth";
import { INTERNAL_LOGIN_PATH } from "@/lib/internal-paths";
import { InternalConfigError } from "@/components/internal/InternalConfigError";

type InternalGateProps = {
  children: React.ReactNode;
  loginNext: string;
};

export function InternalGate({ children, loginNext }: InternalGateProps) {
  const router = useRouter();
  const { session, loading, configError, isMember, signOut } = useInternalAuth();

  useEffect(() => {
    if (loading || configError) return;
    if (!session?.user) {
      router.replace(
        `${INTERNAL_LOGIN_PATH}?next=${encodeURIComponent(loginNext)}`
      );
    }
  }, [loading, configError, session, loginNext, router]);

  if (configError) {
    return <InternalConfigError />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1c40] text-slate-300">
        Loading…
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1c40] text-slate-300">
        Redirecting to sign in…
      </div>
    );
  }

  if (isMember === false) {
    return (
      <div className="min-h-screen bg-[#0f1c40] px-6 py-16 text-center">
        <div className="mx-auto max-w-lg space-y-4">
          <h1 className="text-2xl font-bold text-white">Access not allowed</h1>
          <p className="text-slate-300">
            Signed in as {session.user.email}. Internal tools are limited to the
            StancePro team allowlist.
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (isMember !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1c40] text-slate-300">
        Checking access…
      </div>
    );
  }

  return <>{children}</>;
}
