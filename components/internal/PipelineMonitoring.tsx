"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { InternalChrome } from "@/components/internal/InternalChrome";
import { useInternalAuth } from "@/hooks/useInternalAuth";

type FreshnessRow = {
  table: string;
  source: string;
  latest: string | null;
  threshold_days: number;
  stale: boolean;
};

type CronRow = {
  name: string;
  schedule: string;
  active: boolean;
  last_status: string | null;
  last_run: string | null;
};

type HygieneRow = { check: string; value: number; ok: boolean };

type AlertRow = { title: string; body: string; created_at: string };

type MonitoringPayload = {
  generated_at: string;
  freshness: FreshnessRow[];
  crons: CronRow[];
  video_analysis: Record<string, number | string | null>;
  push: Record<string, number>;
  commerce: Record<string, number | string | null>;
  coaching: Record<string, number>;
  hygiene: HygieneRow[];
  activity: Record<string, number>;
  recent_alerts: AlertRow[];
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number | string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        warn
          ? "border-red-400/40 bg-red-500/10"
          : "border-white/10 bg-[#0f1c40]"
      }`}
    >
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${warn ? "text-red-300" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

export function PipelineMonitoring() {
  const { session, signOut, supabase } = useInternalAuth();
  const [data, setData] = useState<MonitoringPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data: payload, error: rpcError } = await supabase.rpc(
      "get_pipeline_monitoring"
    );
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setData(payload as MonitoringPayload);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const va = data?.video_analysis ?? {};
  const push = data?.push ?? {};
  const commerce = data?.commerce ?? {};
  const coaching = data?.coaching ?? {};
  const activity = data?.activity ?? {};

  return (
    <InternalChrome
      title="Pipeline Monitoring"
      subtitle="Data freshness, crons, and ops invariants"
      email={session?.user?.email}
      onSignOut={signOut}
    >
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">
            {data ? `Snapshot: ${new Date(data.generated_at).toLocaleString()}` : "Loading…"}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:border-brand-400/60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {data ? (
          <>
            <Section title="Data freshness (result tables — Vercel cron health is inferred here)">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.freshness.map((f) => (
                  <div
                    key={f.table}
                    className={`rounded-xl border p-3 ${
                      f.stale
                        ? "border-red-400/50 bg-red-500/10"
                        : "border-emerald-400/20 bg-[#0f1c40]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-white">{f.table}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          f.stale ? "bg-red-400/20 text-red-300" : "bg-emerald-400/15 text-emerald-300"
                        }`}
                      >
                        {f.stale ? "STALE" : "OK"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {ago(f.latest)} · limit {f.threshold_days}d
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{f.source}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="pg_cron jobs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400">
                    <tr>
                      <th className="pb-2 pr-4">Job</th>
                      <th className="pb-2 pr-4">Schedule</th>
                      <th className="pb-2 pr-4">Active</th>
                      <th className="pb-2 pr-4">Last status</th>
                      <th className="pb-2">Last run</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {data.crons.map((c) => (
                      <tr key={c.name} className="border-t border-white/5">
                        <td className="py-2 pr-4 font-mono text-xs">{c.name}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-slate-400">{c.schedule}</td>
                        <td className="py-2 pr-4">{c.active ? "yes" : <span className="text-slate-500">no</span>}</td>
                        <td className="py-2 pr-4">
                          {c.last_status === "failed" ? (
                            <span className="font-semibold text-red-300">failed</span>
                          ) : (
                            c.last_status ?? "—"
                          )}
                        </td>
                        <td className="py-2 text-xs text-slate-400">{ago(c.last_run)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Video analysis / AI coaching">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Last run" value={ago(va.last_run as string | null)} />
                  <Stat label="Runs (7d)" value={Number(va.runs_7d ?? 0)} />
                  <Stat label="Stuck runs (>2h)" value={Number(va.stuck_runs ?? 0)} warn={Number(va.stuck_runs ?? 0) > 0} />
                  <Stat label="Gear analyses (7d)" value={Number(va.gear_analyses_7d ?? 0)} />
                </div>
              </Section>

              <Section title="Push notifications">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Notifications (24h)" value={push.notifications_24h ?? 0} />
                  <Stat label="Active device tokens" value={push.active_device_tokens ?? 0} />
                  <Stat label="Legacy outbox rows" value={push.outbox_rows ?? 0} warn={(push.outbox_rows ?? 0) > 0} />
                </div>
              </Section>

              <Section title="Commerce / webhooks">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Last store webhook" value={ago(commerce.last_store_webhook as string | null)} />
                  <Stat label="Airwallex unprocessed" value={Number(commerce.airwallex_unprocessed ?? 0)} warn={Number(commerce.airwallex_unprocessed ?? 0) > 0} />
                  <Stat label="Payouts in flight" value={Number(commerce.payouts_in_flight ?? 0)} />
                  <Stat label="Payouts failed" value={Number(commerce.payouts_failed ?? 0)} warn={Number(commerce.payouts_failed ?? 0) > 0} />
                </div>
              </Section>

              <Section title="Coaching queue">
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Sessions pending" value={coaching.sessions_pending ?? 0} />
                  <Stat label="Sessions processing" value={coaching.sessions_processing ?? 0} />
                  <Stat label="Pending > 48h" value={coaching.pending_over_48h ?? 0} warn={(coaching.pending_over_48h ?? 0) > 0} />
                  <Stat label="Open disputes" value={coaching.open_disputes ?? 0} warn={(coaching.open_disputes ?? 0) > 0} />
                </div>
              </Section>
            </div>

            <Section title="Hygiene invariants">
              <ul className="space-y-2 text-sm">
                {data.hygiene.map((h) => (
                  <li key={h.check} className="flex items-center justify-between">
                    <span className="text-slate-300">{h.check}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        h.ok ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/20 text-red-300"
                      }`}
                    >
                      {h.value} {h.ok ? "· ok" : "· violated"}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Activity (context)">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Profiles" value={activity.profiles_total ?? 0} />
                <Stat label="Messages (24h)" value={activity.messages_24h ?? 0} />
                <Stat label="Clips (7d)" value={activity.clips_7d ?? 0} />
                <Stat label="Personal events (7d)" value={activity.user_events_7d ?? 0} />
              </div>
            </Section>

            <Section title="Watchdog alerts (14d)">
              {data.recent_alerts.length === 0 ? (
                <p className="text-sm text-slate-400">No freshness alerts.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.recent_alerts.map((a) => (
                    <li key={`${a.title}-${a.created_at}`} className="rounded-xl border border-white/10 bg-[#0f1c40] p-3">
                      <div className="font-semibold text-white">{a.title}</div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {a.body} · {ago(a.created_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        ) : null}
      </main>
    </InternalChrome>
  );
}
