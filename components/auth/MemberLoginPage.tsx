"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MEMBER_AUTH_CALLBACK_PATH, sanitizeMemberNext } from "@/lib/member-auth";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 3.9-5.35 3.9a5.9 5.9 0 1 1 0-11.8c1.5 0 2.85.55 3.9 1.45l2.15-2.15A8.9 8.9 0 1 0 12 20.9c4.45 0 8.55-3.2 8.55-8.9 0-.3-.05-.6-.1-.9Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path
        fill="currentColor"
        d="M16.36 12.79c.03 2.9 2.54 3.86 2.57 3.88-.02.07-.4 1.38-1.33 2.73-.8 1.17-1.63 2.33-2.94 2.35-1.29.03-1.7-.76-3.17-.76-1.47 0-1.93.74-3.14.79-1.27.05-2.23-1.26-3.04-2.42C3.66 16.98 2.4 12.66 4.1 9.79c.84-1.42 2.35-2.32 3.99-2.35 1.24-.02 2.42.84 3.17.84.76 0 2.19-1.04 3.69-.88.63.03 2.39.25 3.52 1.91-.09.06-2.1 1.23-2.11 3.48ZM13.93 5.4c.67-.81 1.12-1.94 1-3.06-.97.04-2.14.64-2.83 1.45-.62.72-1.16 1.87-1.02 2.97 1.08.08 2.18-.55 2.85-1.36Z"
      />
    </svg>
  );
}

// Apple web OAuth needs a Services ID configured in Supabase (the app's native
// Sign in with Apple doesn't) — /auth/v1/authorize?provider=apple currently
// returns 400. Flip this on once the dashboard config is in place.
const APPLE_WEB_ENABLED = false;

function MemberLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeMemberNext(searchParams.get("next"));
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "auth" ? "Sign-in link was invalid or expired. Please try again." : null
  );
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        router.replace(next);
      } else {
        setCheckingSession(false);
      }
    });
  }, [supabase, next, router]);

  const callbackUrl = () =>
    `${window.location.origin}${MEMBER_AUTH_CALLBACK_PATH}?next=${encodeURIComponent(next)}`;

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !email.trim()) return;
    setStatus("sending");
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    if (otpError) {
      setError(otpError.message);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  async function oauth(provider: "google" | "apple") {
    if (!supabase) return;
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError) setError(oauthError.message);
  }

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto glass rounded-2xl p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Sign in to StancePro</h1>
      <p className="text-sm text-slate-400 mb-6">
        The calculator, snow forecasts and 3D maps are free with a StancePro
        account — the same one you use in the app.
      </p>

      {status === "sent" ? (
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 text-sm text-slate-200">
          Check <span className="font-semibold">{email}</span> for a sign-in
          link, then come back here.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => oauth("google")}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-2.5 text-sm font-medium text-white hover:border-slate-400 transition-colors"
            >
              <GoogleIcon /> Continue with Google
            </button>
            {APPLE_WEB_ENABLED && (
              <button
                type="button"
                onClick={() => oauth("apple")}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-2.5 text-sm font-medium text-white hover:border-slate-400 transition-colors"
              >
                <AppleIcon /> Continue with Apple
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 my-5 text-xs text-slate-600">
            <span className="flex-1 border-t border-slate-700" />
            or
            <span className="flex-1 border-t border-slate-700" />
          </div>

          <form onSubmit={sendMagicLink} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:from-brand-400 hover:to-brand-500 transition-all disabled:opacity-60"
            >
              {status === "sending" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              Email me a sign-in link
            </button>
          </form>
        </>
      )}

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

      <p className="mt-6 text-xs text-slate-500">
        No account yet? Signing in creates one automatically.{" "}
        <Link href="/download" className="text-brand-400 hover:text-brand-300">
          Or get the app →
        </Link>
      </p>
    </div>
  );
}

export function MemberLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      }
    >
      <MemberLoginContent />
    </Suspense>
  );
}
