"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mountain, RefreshCw } from "lucide-react";
import { InternalChrome } from "@/components/internal/InternalChrome";
import { useInternalAuth } from "@/hooks/useInternalAuth";

const STATUS_URL =
  "https://ryiitcblrrqvjvxkobpf.supabase.co/storage/v1/object/public/ride-tracker-static/backfill/status.json";

type CountryRow = { cc: string; fleet: number; done: number };
type Status = {
  ts: string;
  current: string | null;
  current_cc: string | null;
  resorts_total: number;
  resorts_done: number;
  resorts_skipped: number;
  resorts_remaining: number;
  per_country: CountryRow[];
  tiles_z15: number;
  tiles_z14: number;
  tiles_published: number;
  domain_z15: number;
  throughput_per_tile_s: number;
  throughput_per_resort_s: number;
  running?: boolean;
};

const REFRESH_MS = 60_000;
const n = (v: number) => v.toLocaleString();

export function BackfillDashboard() {
  const { session, signOut } = useInternalAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${STATUS_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setStatus((await res.json()) as Status);
      setError(null);
      setFetchedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    timer.current = setInterval(() => void load(), REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const built = status ? status.tiles_z15 + status.tiles_z14 : 0;
  // ETA honesty: the raw eta assumes the current (slow AT/Tirol) rate for all
  // remaining resorts. Show a range instead — faster countries pull it down.
  const etaLabel = status
    ? status.resorts_remaining < 20
      ? "almost done"
      : "2–5 days"
    : "—";

  return (
    <InternalChrome
      title="Terrain Backfill"
      subtitle="Terrain V2 fleet build"
      email={session?.user?.email}
      onSignOut={signOut}
    >
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Mountain className="h-4 w-4 text-brand-300" />
            {status?.running ? (
              <span className="text-emerald-300">Running</span>
            ) : status ? (
              <span className="text-slate-400">Idle / finished</span>
            ) : (
              <span>Loading…</span>
            )}
            {fetchedAt ? (
              <span className="text-slate-500">
                · updated {fetchedAt.toLocaleTimeString()}
              </span>
            ) : null}
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#1a2e61]/40 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-brand-400/40 hover:bg-[#1a2e61]/70 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error ? (
          <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Couldn&apos;t load status ({error}). The backfill may not have pushed
            yet, or the pusher isn&apos;t running.
          </p>
        ) : null}

        {status ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Resorts done" value={n(status.resorts_done)} sub={`of ${n(status.resorts_total)}`} />
              <Metric label="DEM tiles built" value={n(built)} sub={`z15 ${n(status.tiles_z15)}`} />
              <Metric label="Published" value={n(status.tiles_published)} sub="to Supabase" />
              <Metric label="ETA (rough)" value={etaLabel} sub={`${status.throughput_per_tile_s}s / tile`} />
            </div>

            {status.current ? (
              <div className="mt-5 rounded-xl border border-white/10 bg-[#1a2e61]/30 px-4 py-3 text-sm text-slate-300">
                Now building —{" "}
                <span className="font-medium text-white">{status.current}</span>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-2.5">
              {status.per_country.map((c) => {
                const pct = c.fleet ? Math.round((c.done / c.fleet) * 100) : 0;
                const active = c.cc === status.current_cc;
                return (
                  <div key={c.cc} className="grid grid-cols-[36px_1fr_84px] items-center gap-3 text-sm">
                    <span className="font-medium tabular-nums text-slate-200">{c.cc}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={`h-full rounded-full ${active ? "bg-emerald-400" : c.done ? "bg-brand-400" : "bg-white/10"}`}
                        style={{ width: `${Math.max(pct, c.done ? 3 : 0)}%` }}
                      />
                    </div>
                    <span className="text-right tabular-nums text-xs text-slate-400">
                      {n(c.done)} / {n(c.fleet)}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="mt-6 border-t border-white/10 pt-4 text-sm leading-relaxed text-slate-400">
              Order AT → CA → CH → CZ → ES → FR → IT → JP → NZ → US. The{" "}
              {status.throughput_per_tile_s}s/tile rate is Austria (Tirol WCS), the
              slowest source; Canada, US and NZ run several times faster, so the ETA
              tightens as the run advances. Snapshot pushed {status.ts}; page
              auto-refreshes every minute.
            </p>
          </>
        ) : null}
      </main>
    </InternalChrome>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1c40]/60 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}
