"use client";

import {
  DIFFICULTY_ORDER,
  type MonthlyStats,
} from "@/lib/development-log-merge";

const DIFFICULTY_COLORS: Record<string, string> = {
  Trivial: "#64748b",
  Easy: "#34d399",
  Medium: "#38bdf8",
  Hard: "#fbbf24",
  "Very Hard": "#f87171",
};

type DifficultyChartProps = {
  counts: Record<string, number>;
  total: number;
};

export function DifficultyChart({ counts, total }: DifficultyChartProps) {
  const max = Math.max(...DIFFICULTY_ORDER.map((d) => counts[d] ?? 0), 1);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-5">
      <h2 className="text-sm font-semibold text-white">Cursor sessions by difficulty</h2>
      <p className="mt-1 text-xs text-slate-400">
        Human-authored sessions only · {total} total
      </p>
      <div className="mt-4 space-y-3">
        {DIFFICULTY_ORDER.map((level) => {
          const count = counts[level] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const width = max > 0 ? (count / max) * 100 : 0;
          return (
            <div key={level}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-300">{level}</span>
                <span className="tabular-nums text-slate-500">
                  {count} · {pct}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${width}%`,
                    backgroundColor: DIFFICULTY_COLORS[level],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type MonthlyChartProps = {
  stats: MonthlyStats[];
};

export function MonthlyActivityChart({ stats }: MonthlyChartProps) {
  if (stats.length === 0) return null;

  const maxCount = Math.max(
    ...stats.map((s) => s.cursorSessions + s.founderEntries),
    1
  );
  const maxLines = Math.max(...stats.map((s) => s.linesChanged), 1);
  const chartW = Math.max(stats.length * 36, 320);
  const barW = 14;
  const gap = 22;
  const height = 160;
  const padBottom = 28;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-5">
      <h2 className="text-sm font-semibold text-white">Monthly activity</h2>
      <p className="mt-1 text-xs text-slate-400">
        Founder entries (amber) + Cursor sessions (blue). Line overlay = code churn.
      </p>
      <div className="mt-4 overflow-x-auto">
        <svg
          width={chartW}
          height={height + padBottom}
          className="min-w-full"
          role="img"
          aria-label="Monthly development activity chart"
        >
          {stats.map((row, i) => {
            const x = 24 + i * gap;
            const founderH =
              (row.founderEntries / maxCount) * (height - 20);
            const cursorH =
              (row.cursorSessions / maxCount) * (height - 20);
            const lineY =
              height - (row.linesChanged / maxLines) * (height - 20);
            return (
              <g key={row.month}>
                <rect
                  x={x}
                  y={height - founderH}
                  width={barW / 2 - 1}
                  height={founderH}
                  rx={2}
                  fill="#fbbf24"
                  opacity={0.85}
                />
                <rect
                  x={x + barW / 2 + 1}
                  y={height - cursorH}
                  width={barW / 2 - 1}
                  height={cursorH}
                  rx={2}
                  fill="#38bdf8"
                  opacity={0.9}
                />
                {i > 0 ? (
                  <line
                    x1={24 + (i - 1) * gap + barW / 2}
                    y1={
                      height -
                      (stats[i - 1].linesChanged / maxLines) * (height - 20)
                    }
                    x2={x + barW / 2}
                    y2={lineY}
                    stroke="#a78bfa"
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
                ) : null}
                <circle cx={x + barW / 2} cy={lineY} r={2.5} fill="#c4b5fd" />
                <text
                  x={x + barW / 2}
                  y={height + padBottom - 8}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px]"
                  transform={`rotate(-35 ${x + barW / 2} ${height + padBottom - 8})`}
                >
                  {row.month.slice(2)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />
          Founder
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-sky-400" />
          Cursor
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-violet-300" />
          Line churn
        </span>
      </div>
    </div>
  );
}
