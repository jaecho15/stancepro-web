"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { InternalChrome } from "@/components/internal/InternalChrome";
import { DevelopmentLogTabs } from "@/components/internal/DevelopmentLogTabs";
import { useInternalAuth } from "@/hooks/useInternalAuth";
import {
  FOUNDER_JOURNAL_PUBLIC_PATH,
  type FounderJournalEntry,
  type FounderJournalPayload,
} from "@/lib/development-log-types";

function formatDate(date: string, time?: string) {
  if (time) return `${date} ${time}`;
  return date;
}

export function FounderJournalViewer() {
  const { session, signOut } = useInternalAuth();
  const [payload, setPayload] = useState<FounderJournalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [expanded, setExpanded] = useState<FounderJournalEntry | null>(null);

  const load = useCallback(async (bustCache = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = bustCache
        ? `${FOUNDER_JOURNAL_PUBLIC_PATH}?t=${Date.now()}`
        : FOUNDER_JOURNAL_PUBLIC_PATH;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(
          `Failed to load founder journal (${res.status}). Run extract + sync in the StancePro repo.`
        );
      }
      setPayload((await res.json()) as FounderJournalPayload);
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

  const tags = useMemo(() => {
    if (!payload) return [];
    const set = new Set<string>();
    for (const entry of payload.entries) {
      for (const t of entry.tags) set.add(t);
    }
    return [...set].sort();
  }, [payload]);

  const filtered = useMemo(() => {
    if (!payload) return [];
    const q = search.trim().toLowerCase();
    return payload.entries.filter((entry) => {
      if (tag && !entry.tags.includes(tag)) return false;
      if (!q) return true;
      const hay = `${entry.title} ${entry.body} ${entry.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [payload, search, tag]);

  const byMonth = useMemo(() => {
    const map = new Map<string, FounderJournalEntry[]>();
    for (const entry of filtered) {
      const month = entry.date.slice(0, 7);
      if (!map.has(month)) map.set(month, []);
      map.get(month)!.push(entry);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  return (
    <InternalChrome
      title="Founder Journal"
      subtitle="Manual development log · Mar–Nov 2025"
      email={session?.user?.email}
      onSignOut={signOut}
      backHref="/internal"
    >
      <main className="mx-auto max-w-4xl px-6 py-8">
        <DevelopmentLogTabs />
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            {payload?.source ?? "Founder manual journal"} ·{" "}
            {payload
              ? `${payload.time_range_start} → ${payload.time_range_end}`
              : "—"}
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

        <section className="mb-6 rounded-2xl border border-white/10 bg-[#1a2e61]/30 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-400">
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title, body, tag…"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Tag
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white"
              >
                <option value="">All</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {filtered.length} / {payload?.entries.length ?? 0} entries
          </p>
        </section>

        {loading && !payload ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-8">
            {byMonth.map(([month, rows]) => (
              <section key={month}>
                <h2 className="mb-3 text-base font-semibold text-white">{month}</h2>
                <ol className="space-y-3 border-l border-white/10 pl-4">
                  {rows.map((entry) => (
                    <li key={`${entry.date}-${entry.title}-${entry.time ?? ""}`}>
                      <button
                        type="button"
                        onClick={() => setExpanded(entry)}
                        className="w-full rounded-xl border border-white/10 bg-[#1a2e61]/40 p-4 text-left transition-colors hover:border-brand-400/30 hover:bg-[#1a2e61]/70"
                      >
                        <p className="text-xs text-slate-500">
                          {formatDate(entry.date, entry.time)}
                        </p>
                        <p className="mt-1 font-medium text-white">{entry.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                          {entry.body}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {entry.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        {payload?.open_todos?.length ? (
          <section className="mt-10 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200">
              Open TODOs (as of journal)
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {payload.open_todos.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {payload?.technical_notes?.length ? (
          <section className="mt-6 rounded-2xl border border-white/10 bg-[#0f1c40]/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Technical notes
            </h2>
            {payload.technical_notes.map((note) => (
              <div key={note.topic} className="mt-3">
                <p className="text-sm font-medium text-white">{note.topic}</p>
                <p className="mt-1 text-sm text-slate-400">{note.body}</p>
              </div>
            ))}
          </section>
        ) : null}
      </main>

      {expanded ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setExpanded(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1c40] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-slate-500">
              {formatDate(expanded.date, expanded.time)}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">{expanded.title}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">
              {expanded.body}
            </p>
            <button
              type="button"
              onClick={() => setExpanded(null)}
              className="mt-4 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </InternalChrome>
  );
}
