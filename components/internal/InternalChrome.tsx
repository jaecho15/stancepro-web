"use client";

import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

type InternalChromeProps = {
  title: string;
  subtitle?: string;
  email?: string | null;
  onSignOut: () => void;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
};

export function InternalChrome({
  title,
  subtitle,
  email,
  onSignOut,
  backHref,
  backLabel = "Internal home",
  children,
}: InternalChromeProps) {
  return (
    <div className="min-h-screen bg-[#0f1c40]">
      <header className="border-b border-white/10 bg-[#1a2e61]/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-4">
            <BrandLogo iconSize={32} wordmarkWidth={140} />
            <div>
              <p className="text-lg font-semibold text-white">{title}</p>
              {subtitle ? (
                <p className="text-xs text-slate-400">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </Link>
            ) : null}
            {email ? <span>{email}</span> : null}
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/5"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
