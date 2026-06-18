"use client";

import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  INTERNAL_AUTH_CALLBACK_PATH,
  sanitizeInternalNext,
} from "@/lib/internal-paths";

type InternalLoginFormProps = {
  supabase: ReturnType<typeof import("@/lib/supabase/client").createClient>;
  nextPath?: string | null;
  authError?: boolean;
};

export function InternalLoginForm({
  supabase,
  nextPath,
  authError,
}: InternalLoginFormProps) {
  const [email, setEmail] = useState("");
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(
    authError ? "Sign-in link expired or invalid. Request a new one." : null
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginMessage(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    const next = sanitizeInternalNext(nextPath);
    const redirectTo = `${window.location.origin}${INTERNAL_AUTH_CALLBACK_PATH}?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setLoginError(error.message);
      return;
    }
    setLoginMessage("Check your email for a sign-in link.");
  };

  return (
    <div className="min-h-screen bg-[#0f1c40] px-6 py-16">
      <div className="mx-auto max-w-md space-y-8">
        <div className="flex justify-center">
          <BrandLogo iconSize={40} wordmarkWidth={180} />
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#1a2e61]/50 p-8">
          <h1 className="text-2xl font-bold text-white">StancePro Internal</h1>
          <p className="mt-2 text-sm text-slate-300">
            Company tools for the StancePro team. Sign in with your
            @stance-pro.com email.
          </p>
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@stance-pro.com"
              className="w-full rounded-lg border border-white/10 bg-[#0f1c40] px-4 py-3 text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-brand-600 py-3 font-medium text-white hover:bg-brand-500"
            >
              Email me a sign-in link
            </button>
          </form>
          {loginMessage ? (
            <p className="mt-4 text-sm text-emerald-400">{loginMessage}</p>
          ) : null}
          {loginError ? (
            <p className="mt-4 text-sm text-red-400">{loginError}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
