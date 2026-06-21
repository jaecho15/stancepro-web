"use client";

import { useInternalAuth } from "@/hooks/useInternalAuth";

type FinanceGateProps = {
  children: React.ReactNode;
};

export function FinanceGate({ children }: FinanceGateProps) {
  const { session, isFinanceAdmin, signOut } = useInternalAuth();

  if (isFinanceAdmin !== true) {
    return (
      <div className="min-h-screen bg-[#0f1c40] px-6 py-16 text-center">
        <div className="mx-auto max-w-lg space-y-4">
          <h1 className="text-2xl font-bold text-white">Finance access required</h1>
          <p className="text-slate-300">
            Signed in as {session?.user?.email ?? "unknown"}. The finance ledger is
            limited to the finance admin allowlist.
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
