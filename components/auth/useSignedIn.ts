"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Client-side session presence: null while resolving, then boolean, kept in
// sync with auth state changes. Shared by the header nav and auth chip.
export function useSignedIn(): boolean | null {
  const supabase = useMemo(() => createClient(), []);
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

  return signedIn;
}
