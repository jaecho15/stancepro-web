"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type InternalAuthState = {
  supabase: ReturnType<typeof createClient> | null;
  session: Session | null;
  loading: boolean;
  isMember: boolean | null;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<boolean>;
};

export function useInternalAuth(): InternalAuthState {
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(
    null
  );
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState<boolean | null>(null);

  const refreshAccess = useCallback(async () => {
    if (!supabase) return false;
    const { data, error } = await supabase.rpc("check_internal_access");
    const allowed = !error && data === true;
    setIsMember(allowed);
    return allowed;
  }, [supabase]);

  useEffect(() => {
    setSupabase(createClient());
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        await refreshAccess();
      } else {
        setIsMember(null);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        await refreshAccess();
      } else {
        setIsMember(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, refreshAccess]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setIsMember(null);
  }, [supabase]);

  return { supabase, session, loading, isMember, signOut, refreshAccess };
}
