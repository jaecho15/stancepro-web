"use client";

import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { InternalChrome } from "@/components/internal/InternalChrome";
import { useInternalAuth } from "@/hooks/useInternalAuth";

export function InternalHub() {
  const { session, signOut } = useInternalAuth();

  return (
    <InternalChrome
      title="StancePro Internal"
      subtitle="Team tools"
      email={session?.user?.email}
      onSignOut={signOut}
    >
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p className="mb-8 text-sm text-slate-400">
          Pick a tool below. More internal apps will appear here over time.
        </p>
        <div className="grid gap-4">
          <Link
            href="/internal/brand-review"
            className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6 transition-colors hover:border-brand-400/40 hover:bg-[#1a2e61]/70"
          >
            <div className="rounded-xl border border-white/10 bg-[#0f1c40] p-3 text-brand-300 group-hover:text-brand-200">
              <ImageIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Brand Review</h2>
              <p className="mt-1 text-sm text-slate-400">
                Rate and comment on business cards and marketing posters.
              </p>
            </div>
          </Link>
        </div>
      </main>
    </InternalChrome>
  );
}
