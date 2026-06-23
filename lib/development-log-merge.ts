import type {
  DevelopmentLogSession,
  FounderJournalEntry,
} from "@/lib/development-log-types";

export type DayGroup = {
  date: string;
  month: string;
  founder: FounderJournalEntry[];
  cursor: DevelopmentLogSession[];
};

export function sessionDateKey(startedAt: string): string {
  return startedAt.slice(0, 10);
}

export function mergeByDay(
  founder: FounderJournalEntry[],
  cursor: DevelopmentLogSession[]
): DayGroup[] {
  const map = new Map<string, DayGroup>();

  const ensure = (date: string): DayGroup => {
    if (!map.has(date)) {
      map.set(date, { date, month: date.slice(0, 7), founder: [], cursor: [] });
    }
    return map.get(date)!;
  };

  for (const entry of founder) {
    ensure(entry.date).founder.push(entry);
  }

  for (const session of cursor) {
    const date = sessionDateKey(session.started_at);
    if (!date) continue;
    ensure(date).cursor.push(session);
  }

  for (const group of map.values()) {
    group.founder.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
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
  founderEntries: number;
  linesChanged: number;
};

export function buildMonthlyStats(
  founder: FounderJournalEntry[],
  cursor: DevelopmentLogSession[],
  hideSubagents: boolean
): MonthlyStats[] {
  const map = new Map<string, MonthlyStats>();

  const ensure = (month: string): MonthlyStats => {
    if (!map.has(month)) {
      map.set(month, {
        month,
        cursorSessions: 0,
        founderEntries: 0,
        linesChanged: 0,
      });
    }
    return map.get(month)!;
  };

  for (const entry of founder) {
    const month = entry.date.slice(0, 7);
    if (month) ensure(month).founderEntries += 1;
  }

  for (const session of cursor) {
    if (hideSubagents && session.is_subagent) continue;
    const month = session.month || sessionDateKey(session.started_at).slice(0, 7);
    if (!month) continue;
    const row = ensure(month);
    row.cursorSessions += 1;
    row.linesChanged += session.lines_added + session.lines_removed;
  }

  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}
