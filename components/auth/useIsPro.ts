"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * The apps' `PremiumManager.paymentsDisabled` kill switch, mirrored so the
 * three clients gate on one expression: `paymentsDisabled || isPro`. False on
 * iOS and Android today; flipping it opens every Pro gate on this client.
 */
export const PAYMENTS_DISABLED = false;

/**
 * Whether the signed-in user holds an active Pro entitlement — the same fact
 * the apps read from RevenueCat, here read from the server row the RevenueCat
 * webhook maintains (`has_active_pro()`, subscription or lifetime, unexpired).
 * `null` while resolving; `false` when signed out or when the check fails, so
 * a gate never opens on an error.
 */
export function useIsPro(): boolean | null {
  const supabase = useMemo(() => createClient(), []);
  const [isPro, setIsPro] = useState<boolean | null>(null);

  useEffect(() => {
    if (PAYMENTS_DISABLED) {
      setIsPro(true);
      return;
    }
    if (!supabase) {
      setIsPro(false);
      return;
    }
    let cancelled = false;
    const resolve = async (hasSession: boolean) => {
      if (!hasSession) {
        if (!cancelled) setIsPro(false);
        return;
      }
      const { data, error } = await supabase.rpc("has_active_pro");
      if (!cancelled) setIsPro(!error && data === true);
    };
    supabase.auth.getSession().then(({ data }) => resolve(!!data.session?.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolve(!!session?.user);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return isPro;
}
