"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type InternalAuthState = {
  supabase: ReturnType<typeof createClient>;
  session: Session | null;
  loading: boolean;
  configError: boolean;
  isMember: boolean | null;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<boolean>;
};

const InternalAuthContext = createContext<InternalAuthState | null>(null);

export function InternalAuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient>>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  const [isMember, setIsMember] = useState<boolean | null>(null);

  const refreshAccess = useCallback(async () => {
    if (!supabase) return false;
    try {
      const { data, error } = await supabase.rpc("check_internal_access");
      const allowed = !error && data === true;
      setIsMember(allowed);
      return allowed;
    } catch {
      setIsMember(false);
      return false;
    }
  }, [supabase]);

  useEffect(() => {
    const client = createClient();
    if (!client) {
      setConfigError(true);
      setLoading(false);
      return;
    }
    setSupabase(client);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    const finishLoading = () => {
      if (mounted) setLoading(false);
    };

    const timeout = window.setTimeout(finishLoading, 12_000);

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          setSession(null);
          setIsMember(null);
          return;
        }

        setSession(data.session);
        if (data.session) {
          await refreshAccess();
        } else {
          setIsMember(null);
        }
      } catch {
        if (!mounted) return;
        setSession(null);
        setIsMember(null);
      } finally {
        window.clearTimeout(timeout);
        finishLoading();
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (nextSession) {
        await refreshAccess();
      } else {
        setIsMember(null);
      }
      finishLoading();
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [supabase, refreshAccess]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setIsMember(null);
  }, [supabase]);

  const value = useMemo(
    () => ({
      supabase,
      session,
      loading,
      configError,
      isMember,
      signOut,
      refreshAccess,
    }),
    [supabase, session, loading, configError, isMember, signOut, refreshAccess]
  );

  return (
    <InternalAuthContext.Provider value={value}>
      {children}
    </InternalAuthContext.Provider>
  );
}

export function useInternalAuth(): InternalAuthState {
  const context = useContext(InternalAuthContext);
  if (!context) {
    throw new Error("useInternalAuth must be used within InternalAuthProvider");
  }
  return context;
}
