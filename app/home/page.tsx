import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleUserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchSeasonalOutlooks } from "@/lib/snow/fetch";
import { WebToolCards } from "@/components/WebToolCards";
import { SeasonalTilesSection } from "@/components/snow/SeasonalTilesSection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home | StancePro",
  robots: { index: false, follow: false },
};

export default async function MemberHomePage() {
  // Middleware guarantees a session; the profile name personalises the hub.
  let displayName: string | null = null;
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, name")
        .eq("id", user.id)
        .maybeSingle();
      displayName = profile?.display_name ?? profile?.name ?? null;
    }
  }
  const seasonalRows = await fetchSeasonalOutlooks();

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <section className="relative container mx-auto px-6 pt-28 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold">
              {displayName ? (
                <>
                  Welcome back, <span className="gradient-text">{displayName}</span>
                </>
              ) : (
                <>
                  Welcome to <span className="gradient-text">StancePro</span>
                </>
              )}
            </h1>
            <p className="text-slate-400 mt-2">
              Your tools, synced with the same account you use in the app.
            </p>
          </div>

          <Link
            href="/profile"
            className="glass rounded-2xl px-6 py-4 mb-6 flex items-center gap-4 border border-transparent hover:border-brand-500/50 transition-all group"
          >
            <CircleUserRound className="w-7 h-7 text-amber-400 shrink-0" />
            <span className="min-w-0">
              <span className="block text-lg font-semibold text-white">
                My profile &amp; setups
              </span>
              <span className="block text-sm text-slate-400">
                Your profile, saved stance setups and gear from the app.
              </span>
            </span>
            <ArrowRight className="w-5 h-5 text-slate-500 ml-auto group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all shrink-0" />
          </Link>

          <WebToolCards />

          <div className="mt-12">
            <SeasonalTilesSection rows={seasonalRows} />
          </div>

          <p className="text-sm text-slate-500">
            Looking for coaching, gear assessment or ride tracking?{" "}
            <Link href="/download" className="text-brand-400 hover:text-brand-300">
              They live in the app →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
