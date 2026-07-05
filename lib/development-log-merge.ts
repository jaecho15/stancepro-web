import type {
  DevelopmentLogSession,
  FounderJournalEntry,
  TimelineEvidenceEntry,
} from "@/lib/development-log-types";

export type DayGroup = {
  date: string;
  month: string;
  founder: FounderJournalEntry[];
  evidence: TimelineEvidenceEntry[];
  cursor: DevelopmentLogSession[];
  claude: DevelopmentLogSession[];
};

export function sessionDateKey(startedAt: string): string {
  return startedAt.slice(0, 10);
}

export function mergeByDay(
  founder: FounderJournalEntry[],
  evidence: TimelineEvidenceEntry[],
  cursor: DevelopmentLogSession[],
  claude: DevelopmentLogSession[] = []
): DayGroup[] {
  const map = new Map<string, DayGroup>();

  const ensure = (date: string): DayGroup => {
    if (!map.has(date)) {
      map.set(date, {
        date,
        month: date.slice(0, 7),
        founder: [],
        evidence: [],
        cursor: [],
        claude: [],
      });
    }
    return map.get(date)!;
  };

  for (const entry of founder) {
    ensure(entry.date).founder.push(entry);
  }

  for (const row of evidence) {
    if (!row.date) continue;
    ensure(row.date).evidence.push(row);
  }

  for (const session of cursor) {
    const date = sessionDateKey(session.started_at);
    if (!date) continue;
    ensure(date).cursor.push(session);
  }

  for (const session of claude) {
    const date = sessionDateKey(session.started_at);
    if (!date) continue;
    ensure(date).claude.push(session);
  }

  for (const group of map.values()) {
    group.claude.sort((a, b) => a.started_at.localeCompare(b.started_at));
    group.founder.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    group.evidence.sort((a, b) => {
      const sourceOrder = (s: string) =>
        s === "git" ? 0 : s === "supabase migration" ? 1 : 2;
      const bySource = sourceOrder(a.source) - sourceOrder(b.source);
      if (bySource !== 0) return bySource;
      return a.title.localeCompare(b.title);
    });
  }

  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function groupDaysByMonth(days: DayGroup[]): [string, DayGroup[]][] {
  const map = new Map<string, DayGroup[]>();
  for (const day of days) {
    if (!map.has(day.month)) map.set(day.month, []);
    map.get(day.month)!.push(day);
  }
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
}

export const DIFFICULTY_ORDER = [
  "Trivial",
  "Easy",
  "Medium",
  "Hard",
  "Very Hard",
] as const;

export type MonthlyStats = {
  month: string;
  cursorSessions: number;
  estimatedCursorSessions: number;
  founderEntries: number;
  gitCommits: number;
  evidenceRows: number;
  linesChanged: number;
};

export type CursorEstimateMonth = {
  month: string;
  estimated_human_sessions: number;
};

export function buildMonthlyStats(
  founder: FounderJournalEntry[],
  evidence: TimelineEvidenceEntry[],
  cursor: DevelopmentLogSession[],
  hideSubagents: boolean,
  cursorEstimates: CursorEstimateMonth[] = []
): MonthlyStats[] {
  const map = new Map<string, MonthlyStats>();

  const ensure = (month: string): MonthlyStats => {
    if (!map.has(month)) {
      map.set(month, {
        month,
        cursorSessions: 0,
        estimatedCursorSessions: 0,
        founderEntries: 0,
        gitCommits: 0,
        evidenceRows: 0,
        linesChanged: 0,
      });
    }
    return map.get(month)!;
  };

  for (const entry of founder) {
    const month = entry.date.slice(0, 7);
    if (month) ensure(month).founderEntries += 1;
  }

  for (const row of evidence) {
    const month = row.month || row.date.slice(0, 7);
    if (!month) continue;
    const stats = ensure(month);
    stats.evidenceRows += 1;
    if (row.source === "git") stats.gitCommits += 1;
  }

  for (const session of cursor) {
    if (hideSubagents && session.is_subagent) continue;
    const month = session.month || sessionDateKey(session.started_at).slice(0, 7);
    if (!month) continue;
    const row = ensure(month);
    row.cursorSessions += 1;
    row.linesChanged += session.lines_added + session.lines_removed;
  }

  for (const row of cursorEstimates) {
    if (!row.month) continue;
    ensure(row.month).estimatedCursorSessions = row.estimated_human_sessions ?? 0;
  }

  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}
