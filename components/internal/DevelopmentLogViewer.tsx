"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { InternalChrome } from "@/components/internal/InternalChrome";
import { DevelopmentLogTabs } from "@/components/internal/DevelopmentLogTabs";
import { useInternalAuth } from "@/hooks/useInternalAuth";
import {
  PROMPT_LOG_PUBLIC_PATH,
  type DevelopmentLogPayload,
  type DevelopmentLogSession,
} from "@/lib/development-log-types";

const DIFFICULTY_STYLES: Record<string, string> = {
  Trivial: "bg-slate-500/20 text-slate-300",
  Easy: "bg-emerald-500/15 text-emerald-200",
  Medium: "bg-sky-500/15 text-sky-200",
  Hard: "bg-amber-500/15 text-amber-200",
  "Very Hard": "bg-rose-500/15 text-rose-200",
};

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function truncate(text: string, max = 120) {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function sortSessions(
  sessions: DevelopmentLogSession[],
  sortBy: string
): DevelopmentLogSession[] {
  const copy = [...sessions];
  const byStarted = (a: DevelopmentLogSession, b: DevelopmentLogSession) =>
    (a.started_at || "").localeCompare(b.started_at || "");
  const byLines = (a: DevelopmentLogSession, b: DevelopmentLogSession) =>
    b.lines_added +
    b.lines_removed -
    (a.lines_added + a.lines_removed);

  switch (sortBy) {
    case "started_asc":
      return copy.sort(byStarted);
    case "lines_desc":
      return copy.sort(byLines);
    case "duration_desc":
      return copy.sort((a, b) =>
        (b.duration || "").localeCompare(a.duration || "")
      );
    case "title_asc":
      return copy.sort((a, b) =>
        (a.title || "").localeCompare(b.title || "", "en")
      );
    default:
      return copy.sort((a, b) => byStarted(b, a));
  }
}

function SessionTable({
  sessions,
  onSelect,
}: {
  sessions: DevelopmentLogSession[];
  onSelect: (session: DevelopmentLogSession) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#0f1c40]/80 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">Started</th>
            <th className="px-4 py-3">Duration</th>
            <th className="px-4 py-3">Difficulty</th>
            <th className="px-4 py-3">Title / prompt</th>
            <th className="hidden px-4 py-3 md:table-cell">Model</th>
            <th className="hidden px-4 py-3 sm:table-cell">Files</th>
            <th className="hidden px-4 py-3 lg:table-cell">Line changes</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.composer_id}
              className="cursor-pointer border-t border-white/5 transition-colors hover:bg-white/5"
              onClick={() => onSelect(session)}
            >
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">
                {session.started_at || "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                {session.duration || "—"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    DIFFICULTY_STYLES[session.difficulty] ??
                    "bg-white/10 text-slate-300"
                  }`}
                >
                  {session.difficulty}
                </span>
              </td>
              <td className="px-4 py-3">
                {session.is_subagent ? (
                  <span className="mr-2 inline-block rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-200">
                    subagent
                  </span>
                ) : null}
                <span className="font-medium text-white">{session.title}</span>
                {session.first_user_prompt ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                    {truncate(session.first_user_prompt, 140)}
                  </p>
                ) : null}
              </td>
              <td className="hidden px-4 py-3 font-mono text-xs text-slate-400 md:table-cell">
                {session.model || "—"}
              </td>
              <td className="hidden px-4 py-3 text-slate-400 sm:table-cell">
                {session.files_changed}
              </td>
              <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-slate-400 lg:table-cell">
                +{session.lines_added} / −{session.lines_removed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DevelopmentLogViewer() {
  const { session, signOut } = useInternalAuth();
  const [payload, setPayload] = useState<DevelopmentLogPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [model, setModel] = useState("");
  const [hideSubagents, setHideSubagents] = useState(true);
  const [groupByMonth, setGroupByMonth] = useState(true);
  const [sortBy, setSortBy] = useState("started_desc");
  const [selected, setSelected] = useState<DevelopmentLogSession | null>(null);

  const load = useCallback(async (bustCache = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = bustCache
        ? `${PROMPT_LOG_PUBLIC_PATH}?t=${Date.now()}`
        : PROMPT_LOG_PUBLIC_PATH;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(
          `Failed to load prompt_log.json (${res.status}). Run extract + sync in the StancePro repo.`
        );
      }
      setPayload((await res.json()) as DevelopmentLogPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const months = useMemo(() => {
    if (!payload) return [];
    return [
      ...new Set(payload.sessions.map((s) => s.month).filter(Boolean)),
    ].sort((a, b) => b.localeCompare(a));
  }, [payload]);

  const models = useMemo(() => {
    if (!payload) return [];
    return [
      ...new Set(payload.sessions.map((s) => s.model).filter(Boolean)),
    ].sort();
  }, [payload]);

  const filtered = useMemo(() => {
    if (!payload) return [];
    const q = search.trim().toLowerCase();
    const rows = payload.sessions.filter((s) => {
      if (hideSubagents && s.is_subagent) return false;
      if (month && s.month !== month) return false;
      if (difficulty && s.difficulty !== difficulty) return false;
      if (model && s.model !== model) return false;
      if (!q) return true;
      const hay = `${s.title} ${s.first_user_prompt} ${s.subtitle} ${s.model}`.toLowerCase();
      return hay.includes(q);
    });
    return sortSessions(rows, sortBy);
  }, [
    payload,
    search,
    month,
    difficulty,
    model,
    hideSubagents,
    sortBy,
  ]);

  const grouped = useMemo(() => {
    const map = new Map<string, DevelopmentLogSession[]>();
    for (const row of filtered) {
      const key = row.month || "(unknown)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const summary = payload?.summary;

  return (
    <InternalChrome
      title="Development Log"
      subtitle="Cursor prompt & task history"
      email={session?.user?.email}
      onSignOut={signOut}
      backHref="/internal"
    >
      <main className="mx-auto max-w-6xl px-6 py-8">
        <DevelopmentLogTabs />
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            Cursor chat sessions for the StancePro workspace. Search, filter,
            and browse by month.
          </p>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {summary ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              ["Total sessions", formatNumber(summary.total_sessions)],
              ["Human sessions", formatNumber(summary.human_sessions)],
              ["Subagent", formatNumber(summary.subagent_sessions)],
              ["Files changed", formatNumber(summary.human_files_changed)],
              [
                "+lines / −lines",
                `+${formatNumber(summary.human_lines_added)} / −${formatNumber(summary.human_lines_removed)}`,
              ],
              [
                "Time range",
                `${summary.time_range_start || "—"} → ${summary.time_range_end || "—"}`,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 px-4 py-3"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {payload?.generated_at ? (
          <p className="mb-4 text-xs text-slate-500">
            Generated: {payload.generated_at}
          </p>
        ) : null}

        <section className="mb-6 rounded-2xl border border-white/10 bg-[#1a2e61]/30 p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-slate-400 lg:col-span-2">
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title, prompt, model…"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Month
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white"
              >
                <option value="">All</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Difficulty
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white"
              >
                <option value="">All</option>
                {["Trivial", "Easy", "Medium", "Hard", "Very Hard"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Model
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white"
              >
                <option value="">All</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Sort
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white"
              >
                <option value="started_desc">Start date ↓</option>
                <option value="started_asc">Start date ↑</option>
                <option value="lines_desc">Line changes ↓</option>
                <option value="duration_desc">Duration ↓</option>
                <option value="title_asc">Title A→Z</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={hideSubagents}
                onChange={(e) => setHideSubagents(e.target.checked)}
                className="rounded border-white/20"
              />
              Human sessions only
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={groupByMonth}
                onChange={(e) => setGroupByMonth(e.target.checked)}
                className="rounded border-white/20"
              />
              Group by month
            </label>
            <span className="ml-auto text-xs text-slate-500">
              {formatNumber(filtered.length)} /{" "}
              {formatNumber(payload?.sessions.length ?? 0)} sessions
            </span>
          </div>
        </section>

        {loading && !payload ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400">No sessions match your filters.</p>
        ) : groupByMonth ? (
          <div className="space-y-8">
            {grouped.map(([monthKey, rows]) => (
              <section key={monthKey}>
                <h2 className="mb-3 text-base font-semibold text-white">
                  {monthKey}{" "}
                  <span className="text-sm font-normal text-slate-400">
                    {rows.length} session(s)
                  </span>
                </h2>
                <SessionTable sessions={rows} onSelect={setSelected} />
              </section>
            ))}
          </div>
        ) : (
          <SessionTable sessions={filtered} onSelect={setSelected} />
        )}
      </main>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1c40] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {selected.title}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {selected.started_at} · {selected.duration || "—"} ·{" "}
                  {selected.difficulty}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-white/15 px-2 py-1 text-sm text-slate-300 hover:bg-white/5"
              >
                Close
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-b border-white/10 px-5 py-4 text-sm sm:grid-cols-3">
              {[
                ["Model", selected.model || "—"],
                ["Files", selected.files_changed],
                ["+lines", selected.lines_added],
                ["−lines", selected.lines_removed],
                ["Bubbles", selected.bubbles],
                ["Subagent", selected.is_subagent ? "yes" : "no"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] uppercase tracking-wide text-slate-500">
                    {k}
                  </dt>
                  <dd className="text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="px-5 py-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                First user prompt
              </p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#1a2e61]/40 p-4 font-mono text-xs text-slate-200">
                {selected.first_user_prompt || "(empty)"}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </InternalChrome>
  );
}
