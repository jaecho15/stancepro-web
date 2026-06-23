"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, GitBranch, MessageSquare, RefreshCw } from "lucide-react";
import { InternalChrome } from "@/components/internal/InternalChrome";
import { useInternalAuth } from "@/hooks/useInternalAuth";
import {
  DifficultyChart,
  MonthlyActivityChart,
} from "@/components/internal/DevelopmentLogCharts";
import {
  FOUNDER_JOURNAL_PUBLIC_PATH,
  PROMPT_LOG_PUBLIC_PATH,
  TIMELINE_2025_PUBLIC_PATH,
  type DevelopmentLogPayload,
  type DevelopmentLogSession,
  type FounderJournalEntry,
  type FounderJournalPayload,
  type Timeline2025Payload,
  type TimelineEvidenceEntry,
} from "@/lib/development-log-types";
import {
  buildMonthlyStats,
  groupDaysByMonth,
  mergeByDay,
  type DayGroup,
} from "@/lib/development-log-merge";

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

function truncate(text: string, max = 140) {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

const EVIDENCE_STYLES: Record<string, string> = {
  git: "border-emerald-500/15 bg-emerald-500/5 hover:border-emerald-400/30 hover:bg-emerald-500/10",
  documentation:
    "border-violet-500/15 bg-violet-500/5 hover:border-violet-400/30 hover:bg-violet-500/10",
  "supabase migration":
    "border-teal-500/15 bg-teal-500/5 hover:border-teal-400/30 hover:bg-teal-500/10",
};

function filterEvidence(
  rows: TimelineEvidenceEntry[],
  q: string,
  month: string,
  source: string,
  area: string
) {
  return rows.filter((row) => {
    if (month && row.month !== month && !row.date.startsWith(month)) return false;
    if (source && row.source !== source) return false;
    if (area && !row.areas.includes(area)) return false;
    if (!q) return true;
    const hay = `${row.title} ${row.evidence} ${row.detail ?? ""} ${row.areas.join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
}
function filterFounder(
  entries: FounderJournalEntry[],
  q: string,
  month: string,
  tag: string
) {
  return entries.filter((entry) => {
    if (month && !entry.date.startsWith(month)) return false;
    if (tag && !entry.tags.includes(tag)) return false;
    if (!q) return true;
    const hay = `${entry.title} ${entry.body} ${entry.tags.join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
}

function filterCursor(
  sessions: DevelopmentLogSession[],
  q: string,
  month: string,
  difficulty: string,
  model: string,
  hideSubagents: boolean
) {
  return sessions.filter((s) => {
    if (hideSubagents && s.is_subagent) return false;
    if (month && s.month !== month) return false;
    if (difficulty && s.difficulty !== difficulty) return false;
    if (model && s.model !== model) return false;
    if (!q) return true;
    const hay = `${s.title} ${s.first_user_prompt} ${s.subtitle} ${s.model}`.toLowerCase();
    return hay.includes(q);
  });
}

function DayTimeline({
  day,
  onSelectFounder,
  onSelectEvidence,
  onSelectCursor,
}: {
  day: DayGroup;
  onSelectFounder: (e: FounderJournalEntry) => void;
  onSelectEvidence: (e: TimelineEvidenceEntry) => void;
  onSelectCursor: (s: DevelopmentLogSession) => void;
}) {
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const hasFounder = day.founder.length > 0;
  const hasEvidence = day.evidence.length > 0;
  const hasCursor = day.cursor.length > 0;
  if (!hasFounder && !hasEvidence && !hasCursor) return null;

  const evidenceLimit = 8;
  const visibleEvidence =
    showAllEvidence || day.evidence.length <= evidenceLimit
      ? day.evidence
      : day.evidence.slice(0, evidenceLimit);

  return (
    <article className="rounded-2xl border border-white/10 bg-[#0f1c40]/40 overflow-hidden">
      <header className="border-b border-white/10 bg-[#1a2e61]/30 px-4 py-3">
        <h3 className="font-mono text-sm font-semibold text-white">{day.date}</h3>
      </header>

      {hasFounder ? (
        <section className="border-b border-white/5 px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-200/90">
            <BookOpen className="h-3.5 w-3.5" />
            Founder journal · {day.founder.length}
          </div>
          <ul className="space-y-2">
            {day.founder.map((entry) => (
              <li key={`${entry.date}-${entry.title}-${entry.time ?? ""}`}>
                <button
                  type="button"
                  onClick={() => onSelectFounder(entry)}
                  className="w-full rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-left transition-colors hover:border-amber-400/30 hover:bg-amber-500/10"
                >
                  <p className="text-[10px] text-amber-200/70">
                    {entry.time ? `${entry.date} ${entry.time}` : entry.date}
                  </p>
                  <p className="mt-0.5 font-medium text-white">{entry.title}</p>
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
          </ul>
        </section>
      ) : null}

      {hasEvidence ? (
        <section
          className={`px-4 py-3 ${hasCursor ? "border-b border-white/5" : ""}`}
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-200/90">
            <GitBranch className="h-3.5 w-3.5" />
            Git & evidence · {day.evidence.length}
          </div>
          <div className="space-y-2">
            {visibleEvidence.map((row) => (
              <button
                key={`${row.date}-${row.source}-${row.evidence}-${row.title}`}
                type="button"
                onClick={() => onSelectEvidence(row)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  EVIDENCE_STYLES[row.source] ??
                  "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 capitalize text-slate-300">
                    {row.source}
                  </span>
                  <span>{row.confidence}</span>
                </div>
                <p className="mt-1 font-medium text-white">{row.title}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">
                  {row.evidence}
                </p>
                {row.areas.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.areas.slice(0, 4).map((area) => (
                      <span
                        key={area}
                        className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
          {day.evidence.length > evidenceLimit ? (
            <button
              type="button"
              onClick={() => setShowAllEvidence((v) => !v)}
              className="mt-2 text-xs text-emerald-200/80 hover:text-emerald-100"
            >
              {showAllEvidence
                ? "Show fewer"
                : `Show ${day.evidence.length - evidenceLimit} more`}
            </button>
          ) : null}
        </section>
      ) : null}

      {hasCursor ? (
        <section className="px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-200/90">
            <MessageSquare className="h-3.5 w-3.5" />
            Cursor sessions · {day.cursor.length}
          </div>
          <div className="space-y-2">
            {day.cursor.map((session) => (
              <button
                key={session.composer_id}
                type="button"
                onClick={() => onSelectCursor(session)}
                className="w-full rounded-xl border border-sky-500/15 bg-sky-500/5 p-3 text-left transition-colors hover:border-sky-400/30 hover:bg-sky-500/10"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span>{session.started_at}</span>
                  {session.duration ? <span>· {session.duration}</span> : null}
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold uppercase ${
                      DIFFICULTY_STYLES[session.difficulty] ??
                      "bg-white/10 text-slate-300"
                    }`}
                  >
                    {session.difficulty}
                  </span>
                  {session.is_subagent ? (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-200">
                      subagent
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-medium text-white">{session.title}</p>
                {session.first_user_prompt ? (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                    {truncate(session.first_user_prompt)}
                  </p>
                ) : null}
                <p className="mt-2 text-[10px] text-slate-500">
                  {session.model || "—"} · {session.files_changed} files · +
                  {session.lines_added}/−{session.lines_removed} lines
                </p>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

export function DevelopmentLogViewer() {
  const { session, signOut } = useInternalAuth();
  const [payload, setPayload] = useState<DevelopmentLogPayload | null>(null);
  const [journal, setJournal] = useState<FounderJournalPayload | null>(null);
  const [timeline2025, setTimeline2025] = useState<Timeline2025Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [model, setModel] = useState("");
  const [tag, setTag] = useState("");
  const [evidenceSource, setEvidenceSource] = useState("");
  const [area, setArea] = useState("");
  const [hideSubagents, setHideSubagents] = useState(true);
  const [selectedFounder, setSelectedFounder] = useState<FounderJournalEntry | null>(
    null
  );
  const [selectedEvidence, setSelectedEvidence] =
    useState<TimelineEvidenceEntry | null>(null);
  const [selectedCursor, setSelectedCursor] = useState<DevelopmentLogSession | null>(
    null
  );

  const load = useCallback(async (bustCache = false) => {
    setLoading(true);
    setError(null);
    const bust = bustCache ? `?t=${Date.now()}` : "";
    try {
      const [promptRes, journalRes, timelineRes] = await Promise.all([
        fetch(`${PROMPT_LOG_PUBLIC_PATH}${bust}`),
        fetch(`${FOUNDER_JOURNAL_PUBLIC_PATH}${bust}`),
        fetch(`${TIMELINE_2025_PUBLIC_PATH}${bust}`),
      ]);
      if (!promptRes.ok) {
        throw new Error(`Failed to load prompt_log.json (${promptRes.status})`);
      }
      if (!journalRes.ok) {
        throw new Error(
          `Failed to load founder_development_journal.json (${journalRes.status})`
        );
      }
      if (!timelineRes.ok) {
        throw new Error(
          `Failed to load development_timeline_2025.json (${timelineRes.status})`
        );
      }
      setPayload((await promptRes.json()) as DevelopmentLogPayload);
      setJournal((await journalRes.json()) as FounderJournalPayload);
      setTimeline2025((await timelineRes.json()) as Timeline2025Payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setPayload(null);
      setJournal(null);
      setTimeline2025(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const q = search.trim().toLowerCase();

  const filteredFounder = useMemo(
    () => filterFounder(journal?.entries ?? [], q, month, tag),
    [journal, q, month, tag]
  );

  const filteredCursor = useMemo(
    () =>
      filterCursor(
        payload?.sessions ?? [],
        q,
        month,
        difficulty,
        model,
        hideSubagents
      ),
    [payload, q, month, difficulty, model, hideSubagents]
  );

  const filteredEvidence = useMemo(
    () =>
      filterEvidence(
        timeline2025?.evidence ?? [],
        q,
        month,
        evidenceSource,
        area
      ),
    [timeline2025, q, month, evidenceSource, area]
  );

  const dayGroups = useMemo(
    () => mergeByDay(filteredFounder, filteredEvidence, filteredCursor),
    [filteredFounder, filteredEvidence, filteredCursor]
  );

  const monthGroups = useMemo(() => groupDaysByMonth(dayGroups), [dayGroups]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const s of payload?.sessions ?? []) {
      if (s.month) set.add(s.month);
    }
    for (const e of journal?.entries ?? []) {
      set.add(e.date.slice(0, 7));
    }
    for (const row of timeline2025?.evidence ?? []) {
      if (row.month) set.add(row.month);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [payload, journal, timeline2025]);

  const models = useMemo(() => {
    if (!payload) return [];
    return [...new Set(payload.sessions.map((s) => s.model).filter(Boolean))].sort();
  }, [payload]);

  const tags = useMemo(() => {
    if (!journal) return [];
    const set = new Set<string>();
    for (const e of journal.entries) for (const t of e.tags) set.add(t);
    return [...set].sort();
  }, [journal]);

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const row of timeline2025?.evidence ?? []) {
      for (const a of row.areas) set.add(a);
    }
    return [...set].sort();
  }, [timeline2025]);

  const monthlyStats = useMemo(
    () =>
      buildMonthlyStats(
        journal?.entries ?? [],
        timeline2025?.evidence ?? [],
        payload?.sessions ?? [],
        hideSubagents,
        timeline2025?.cursor_estimates?.monthly ?? []
      ),
    [journal, timeline2025, payload, hideSubagents]
  );

  const difficultyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of filteredCursor) {
      if (s.is_subagent) continue;
      counts[s.difficulty] = (counts[s.difficulty] ?? 0) + 1;
    }
    return counts;
  }, [filteredCursor]);

  const humanCursorCount = useMemo(
    () => filteredCursor.filter((s) => !s.is_subagent).length,
    [filteredCursor]
  );

  const summary = payload?.summary;

  return (
    <InternalChrome
      title="Development Log"
      subtitle="Founder journal + git evidence + Cursor sessions"
      email={session?.user?.email}
      onSignOut={signOut}
      backHref="/internal"
    >
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            Unified timeline: founder notes, 2025 git/docs/migration evidence, and
            Cursor chat sessions on the same day.
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

        {summary && timeline2025 ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {[
              ["Founder entries", formatNumber(journal?.entries.length ?? 0)],
              ["Git commits (2025)", formatNumber(timeline2025.summary.git_commits)],
              ["Evidence rows (2025)", formatNumber(timeline2025.summary.evidence_rows)],
              ["Cursor sessions", formatNumber(summary.total_sessions)],
              ["Human Cursor", formatNumber(summary.human_sessions)],
              [
                "Range",
                `${timeline2025.time_range_start.slice(0, 7)} → ${summary.time_range_end?.slice(0, 7) ?? "—"}`,
              ],
              ...(timeline2025.cursor_estimates
                ? [
                    [
                      "Est. Cursor 2025",
                      `~${formatNumber(timeline2025.cursor_estimates.ensemble_human_sessions)} human (${formatNumber(timeline2025.cursor_estimates.confidence_range_human[0])}–${formatNumber(timeline2025.cursor_estimates.confidence_range_human[1])})`,
                    ],
                  ]
                : []),
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

        {!loading && payload && journal && timeline2025 ? (
          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            <DifficultyChart
              counts={difficultyCounts}
              total={humanCursorCount}
              estimatedCursor2025={
                timeline2025.cursor_estimates?.ensemble_human_sessions
              }
            />
            <MonthlyActivityChart stats={monthlyStats} />
          </div>
        ) : null}

        <section className="mb-6 rounded-2xl border border-white/10 bg-[#1a2e61]/30 p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-slate-400 lg:col-span-2">
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title, prompt, journal body…"
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
              Difficulty (Cursor)
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
              Model (Cursor)
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
              Tag (Founder)
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
            <label className="block text-xs text-slate-400">
              Evidence source
              <select
                value={evidenceSource}
                onChange={(e) => setEvidenceSource(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white"
              >
                <option value="">All</option>
                <option value="git">Git</option>
                <option value="documentation">Documentation</option>
                <option value="supabase migration">Supabase migration</option>
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Area (evidence)
              <select
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white"
              >
                <option value="">All</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
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
              Hide Cursor subagents
            </label>
            <span className="ml-auto text-xs text-slate-500">
              {formatNumber(dayGroups.length)} days · {formatNumber(filteredFounder.length)}{" "}
              founder · {formatNumber(filteredEvidence.length)} evidence ·{" "}
              {formatNumber(filteredCursor.length)} cursor
            </span>
          </div>
        </section>

        {loading && !payload ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : dayGroups.length === 0 ? (
          <p className="text-sm text-slate-400">No entries match your filters.</p>
        ) : (
          <div className="space-y-10">
            {monthGroups.map(([monthKey, days]) => (
              <section key={monthKey}>
                <h2 className="mb-4 text-lg font-semibold text-white">
                  {monthKey}
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    {days.length} day(s)
                    {timeline2025?.monthly.find((m) => m.month === monthKey) ? (
                      <>
                        {" "}
                        · founder{" "}
                        {
                          timeline2025.monthly.find((m) => m.month === monthKey)
                            ?.founder_entries
                        }{" "}
                        · git{" "}
                        {
                          timeline2025.monthly.find((m) => m.month === monthKey)
                            ?.git_commits
                        }
                      </>
                    ) : null}
                  </span>
                </h2>
                <div className="space-y-4">
                  {days.map((day) => (
                    <DayTimeline
                      key={day.date}
                      day={day}
                      onSelectFounder={setSelectedFounder}
                      onSelectEvidence={setSelectedEvidence}
                      onSelectCursor={setSelectedCursor}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {journal?.open_todos?.length ? (
          <section className="mt-10 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200">
              Open TODOs (founder journal snapshot)
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {journal.open_todos.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      {selectedFounder ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setSelectedFounder(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-500/20 bg-[#0f1c40] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-amber-200/80">Founder journal</p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              {selectedFounder.title}
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">
              {selectedFounder.body}
            </p>
            <button
              type="button"
              onClick={() => setSelectedFounder(null)}
              className="mt-4 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {selectedEvidence ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setSelectedEvidence(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-emerald-500/20 bg-[#0f1c40] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs capitalize text-emerald-200/80">
              {selectedEvidence.source} · {selectedEvidence.confidence}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              {selectedEvidence.title}
            </h3>
            <p className="mt-2 font-mono text-xs text-slate-400">
              {selectedEvidence.evidence}
            </p>
            {selectedEvidence.detail ? (
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-300">
                {selectedEvidence.detail}
              </pre>
            ) : null}
            {selectedEvidence.areas.length ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {selectedEvidence.areas.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400"
                  >
                    {a}
                  </span>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setSelectedEvidence(null)}
              className="mt-4 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {selectedCursor ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setSelectedCursor(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1c40] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/10 px-5 py-4">
              <p className="text-xs text-sky-300/80">Cursor session</p>
              <h3 className="mt-1 text-lg font-semibold text-white">
                {selectedCursor.title}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {selectedCursor.started_at} · {selectedCursor.duration || "—"} ·{" "}
                {selectedCursor.difficulty}
              </p>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-5 font-mono text-xs text-slate-200">
              {selectedCursor.first_user_prompt || "(empty)"}
            </pre>
            <button
              type="button"
              onClick={() => setSelectedCursor(null)}
              className="mx-5 mb-5 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </InternalChrome>
  );
}
