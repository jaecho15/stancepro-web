"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const SESSION_INIT_TIMEOUT_MS = 12_000;
const ACCESS_CHECK_TIMEOUT_MS = 8_000;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type InternalAuthState = {
  supabase: ReturnType<typeof createClient>;
  session: Session | null;
  loading: boolean;
  configError: boolean;
  isMember: boolean | null;
  memberCheckError: boolean;
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
  const [memberCheckError, setMemberCheckError] = useState(false);
  const accessCheckGen = useRef(0);

  const refreshAccess = useCallback(async () => {
    if (!supabase) return false;

    const generation = ++accessCheckGen.current;
    setMemberCheckError(false);
    setIsMember(null);

    try {
      const result = await withTimeout(
        Promise.resolve(supabase.rpc("check_internal_access")),
        ACCESS_CHECK_TIMEOUT_MS,
        "Access check"
      );
      if (generation !== accessCheckGen.current) return false;

      const allowed = !result.error && result.data === true;
      setIsMember(allowed);
      if (result.error) setMemberCheckError(true);
      return allowed;
    } catch {
      if (generation !== accessCheckGen.current) return false;
      setIsMember(false);
      setMemberCheckError(true);
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

    const timeout = window.setTimeout(finishLoading, SESSION_INIT_TIMEOUT_MS);

    void (async () => {
      try {
        const sessionResult = await withTimeout(
          Promise.resolve(supabase.auth.getSession()),
          SESSION_INIT_TIMEOUT_MS,
          "Session init"
        );
        if (!mounted) return;

        if (sessionResult.error) {
          setSession(null);
          setIsMember(null);
          return;
        }

        setSession(sessionResult.data.session);
        if (sessionResult.data.session) {
          // Defer RPC — avoid Supabase auth callback deadlock.
          window.setTimeout(() => {
            if (mounted) void refreshAccess();
          }, 0);
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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (nextSession) {
        window.setTimeout(() => {
          if (mounted) void refreshAccess();
        }, 0);
      } else {
        accessCheckGen.current += 1;
        setIsMember(null);
        setMemberCheckError(false);
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
    accessCheckGen.current += 1;
    setIsMember(null);
    setMemberCheckError(false);
  }, [supabase]);

  const value = useMemo(
    () => ({
      supabase,
      session,
      loading,
      configError,
      isMember,
      memberCheckError,
      signOut,
      refreshAccess,
    }),
    [
      supabase,
      session,
      loading,
      configError,
      isMember,
      memberCheckError,
      signOut,
      refreshAccess,
    ]
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
