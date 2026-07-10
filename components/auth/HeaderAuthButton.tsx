"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Small session-aware header chip: "Sign in" when logged out, "Sign out"
// when logged in. Kept self-contained so Header stays presentational.
export function HeaderAuthButton() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) {
      setSignedIn(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session?.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  if (signedIn === null) return null;

  if (!signedIn) {
    return (
      <Link href="/login" className="text-slate-300 hover:text-white transition-colors">
        Sign in
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => {
        await supabase?.auth.signOut();
        router.refresh();
      }}
      className="text-slate-300 hover:text-white transition-colors"
    >
      Sign out
    </button>
  );
}
