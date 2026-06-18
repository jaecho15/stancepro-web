"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { InternalLoginForm } from "@/components/internal/InternalLoginForm";
import { InternalConfigError } from "@/components/internal/InternalConfigError";
import { useInternalAuth } from "@/hooks/useInternalAuth";
import { sanitizeInternalNext } from "@/lib/internal-paths";

function InternalLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase, session, loading, configError, isMember } = useInternalAuth();
  const next = sanitizeInternalNext(searchParams.get("next"));

  useEffect(() => {
    if (loading || configError || !session?.user || isMember !== true) return;
    router.replace(next);
  }, [loading, configError, session, isMember, next, router]);

  if (configError) {
    return <InternalConfigError />;
  }

  if (loading || !supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1c40] text-slate-300">
        Loading…
      </div>
    );
  }

  if (session?.user && isMember === true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1c40] text-slate-300">
        Redirecting…
      </div>
    );
  }

  return (
    <InternalLoginForm
      supabase={supabase}
      nextPath={next}
      authError={searchParams.get("error") === "auth"}
    />
  );
}

export function InternalLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0f1c40] text-slate-300">
          Loading…
        </div>
      }
    >
      <InternalLoginContent />
    </Suspense>
  );
}
