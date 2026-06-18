"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BrandLogo } from "@/components/BrandLogo";
import {
  INTERNAL_AUTH_CALLBACK_PATH,
  sanitizeInternalNext,
} from "@/lib/internal-paths";

type InternalLoginFormProps = {
  supabase: SupabaseClient;
  nextPath?: string | null;
  authError?: boolean;
};

type LoginStep = "email" | "code";

export function InternalLoginForm({
  supabase,
  nextPath,
  authError,
}: InternalLoginFormProps) {
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(
    authError ? "Sign-in expired or invalid. Request a new code." : null
  );

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoginError(null);
    setLoginMessage(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setSubmitting(true);
    const next = sanitizeInternalNext(nextPath);
    const redirectTo = `${window.location.origin}${INTERNAL_AUTH_CALLBACK_PATH}?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo },
    });
    setSubmitting(false);

    if (error) {
      setLoginError(error.message);
      return;
    }

    setStep("code");
    setCode("");
    setLoginMessage(`We sent a sign-in code to ${trimmed}.`);
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();
    if (!trimmedEmail || !trimmedCode) return;

    setSubmitting(true);
    const { error } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: trimmedCode,
      type: "email",
    });
    setSubmitting(false);

    if (error) {
      setLoginError(error.message);
      return;
    }

    setLoginMessage("Signed in. Redirecting…");
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

          {step === "email" ? (
            <form onSubmit={sendCode} className="mt-6 space-y-4">
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
                disabled={submitting}
                className="w-full rounded-lg bg-brand-600 py-3 font-medium text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Email me a sign-in code"}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="mt-6 space-y-4">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
                placeholder="6-digit code"
                maxLength={8}
                className="w-full rounded-lg border border-white/10 bg-[#0f1c40] px-4 py-3 text-center text-lg tracking-[0.3em] text-white placeholder:text-slate-500 placeholder:tracking-normal focus:border-brand-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-brand-600 py-3 font-medium text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {submitting ? "Verifying…" : "Verify and sign in"}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setLoginError(null);
                    setLoginMessage(null);
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  Use a different email
                </button>
                <button
                  type="button"
                  onClick={() => sendCode()}
                  disabled={submitting}
                  className="text-brand-300 hover:text-brand-200 disabled:opacity-60"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

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
