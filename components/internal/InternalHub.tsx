"use client";

import Link from "next/link";
import { History, ImageIcon, Wallet } from "lucide-react";
import { InternalChrome } from "@/components/internal/InternalChrome";
import { useInternalAuth } from "@/hooks/useInternalAuth";

export function InternalHub() {
  const { session, signOut, isFinanceAdmin } = useInternalAuth();

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
          {isFinanceAdmin ? (
            <Link
              href="/internal/finance"
              className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6 transition-colors hover:border-brand-400/40 hover:bg-[#1a2e61]/70"
            >
              <div className="rounded-xl border border-white/10 bg-[#0f1c40] p-3 text-brand-300 group-hover:text-brand-200">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Finance</h2>
                <p className="mt-1 text-sm text-slate-400">
                  FY spend, vendor breakdown, monthly burn, and expense ledger
                  (SGD).
                </p>
              </div>
            </Link>
          ) : null}
          <Link
            href="/internal/development-log"
            className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-6 transition-colors hover:border-brand-400/40 hover:bg-[#1a2e61]/70"
          >
            <div className="rounded-xl border border-white/10 bg-[#0f1c40] p-3 text-brand-300 group-hover:text-brand-200">
              <History className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Development Log</h2>
              <p className="mt-1 text-sm text-slate-400">
                Cursor chat sessions (auto) and founder journal Mar–Nov 2025
                (manual).
              </p>
            </div>
          </Link>
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
                Rate and comment on business cards, posters, and wordmark font
                options.
              </p>
            </div>
          </Link>
        </div>
      </main>
    </InternalChrome>
  );
}
