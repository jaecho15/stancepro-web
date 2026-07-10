"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sanitizeMemberNext } from "@/lib/member-auth";

// Web port of the app's onboarding (OnboardingFlowView.swift): name, birthday
// (age 10–100), gender, terms acceptance — upserted into public.profiles with
// the exact same payload shape so app and web accounts stay interchangeable.

const GENDER_OPTIONS = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "other", label: "Other" },
] as const;

function ageFrom(birthDate: Date): number {
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    now.getMonth() < birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeMemberNext(searchParams.get("next"));
  const supabase = useMemo(() => createClient(), []);

  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<string>("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsVersion, setTermsVersion] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent("/onboarding")}`);
        return;
      }
      setUserId(user.id);

      // Existing profile (created in the app) → nothing to onboard.
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (profile) {
        router.replace(next);
        return;
      }

      // Prefill name from the OAuth identity (Apple-compliance parity with
      // the app: never make the user retype a name we already know).
      const metaName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        "";
      setName(metaName);

      // The current terms version is required before we can record acceptance
      // (same rule as the app's requireFreshTermsDocument).
      const { data: terms } = await supabase
        .from("legal_documents")
        .select("version")
        .eq("document_key", "terms_of_service")
        .eq("is_current", true)
        .maybeSingle();
      setTermsVersion(terms?.version ?? null);

      setReady(true);
    })();
  }, [supabase, router, next]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !userId) return;
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a profile name.");
      return;
    }
    const parsedBirth = birthDate ? new Date(`${birthDate}T00:00:00`) : null;
    const age = parsedBirth ? ageFrom(parsedBirth) : null;
    if (!parsedBirth || age === null || age < 10 || age > 100) {
      setError("Please enter a valid birthday (ages 10 to 100).");
      return;
    }
    if (!termsAccepted) {
      setError("Please agree to the Terms of Service to continue.");
      return;
    }
    if (!termsVersion) {
      setError("Could not load the current Terms of Service. Please try again.");
      return;
    }

    setSaving(true);
    const { error: upsertError } = await supabase.from("profiles").upsert({
      id: userId,
      user_id: userId,
      name: trimmedName,
      display_name: trimmedName,
      age,
      birth_date: birthDate,
      birth_date_is_estimated: false,
      gender: gender || null,
      profile_picture_url: null,
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      accepted_terms_version: termsVersion,
    });
    if (upsertError) {
      setError(`Failed to save your profile: ${upsertError.message}`);
      setSaving(false);
      return;
    }
    router.replace(next);
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto glass rounded-2xl p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Create your profile</h1>
      <p className="text-sm text-slate-400 mb-6">
        One quick step — this is the same StancePro profile the app uses.
      </p>

      <form onSubmit={save} className="space-y-5">
        <div>
          <label className="block text-sm text-slate-400 mb-2">Profile name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How should we call you?"
            className="w-full rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">Birthday</label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-2.5 text-white focus:outline-none focus:border-brand-500 [color-scheme:dark]"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">Gender (optional)</label>
          <div className="flex rounded-xl bg-slate-800/60 p-1 gap-1">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setGender(gender === option.key ? "" : option.key)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  gender === option.key
                    ? "bg-brand-500 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-start gap-3 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 accent-brand-500"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-brand-400 hover:text-brand-300">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy-policy"
              target="_blank"
              className="text-brand-400 hover:text-brand-300"
            >
              Privacy Policy
            </Link>
            {termsVersion ? ` (v${termsVersion})` : ""}
          </span>
        </label>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:from-brand-400 hover:to-brand-500 transition-all disabled:opacity-60"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Create profile
        </button>
      </form>
    </div>
  );
}

export function OnboardingForm() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
