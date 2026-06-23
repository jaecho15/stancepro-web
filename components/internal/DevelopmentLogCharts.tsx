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

function polar(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function pieSlicePath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  end: number
) {
  if (end - start >= Math.PI * 2 - 0.0001) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
  }
  const s = polar(cx, cy, r, start);
  const e = polar(cx, cy, r, end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

type DifficultyChartProps = {
  counts: Record<string, number>;
  total: number;
  estimatedCursor2025?: number;
};

/** Total Cursor session mix by difficulty (pie). */
export function DifficultyChart({
  counts,
  total,
  estimatedCursor2025,
}: DifficultyChartProps) {
  const slices = DIFFICULTY_ORDER.map((level) => ({
    level,
    count: counts[level] ?? 0,
    color: DIFFICULTY_COLORS[level],
  })).filter((s) => s.count > 0);

  const cx = 72;
  const cy = 72;
  const r = 58;
  let angle = -Math.PI / 2;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-5">
      <h2 className="text-sm font-semibold text-white">Total by difficulty</h2>
      <p className="mt-1 text-xs text-slate-400">
        Cursor human sessions · {total} logged
        {estimatedCursor2025 ? (
          <> · ~{estimatedCursor2025} est. in 2025</>
        ) : null}
      </p>
      {total === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No logged sessions in current filters.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <svg
            width={144}
            height={144}
            viewBox="0 0 144 144"
            className="shrink-0"
            role="img"
            aria-label="Difficulty distribution pie chart"
          >
            {slices.map((slice) => {
              const sweep = (slice.count / total) * Math.PI * 2;
              const start = angle;
              const end = angle + sweep;
              angle = end;
              return (
                <path
                  key={slice.level}
                  d={pieSlicePath(cx, cy, r, start, end)}
                  fill={slice.color}
                  stroke="#0f1c40"
                  strokeWidth={1.5}
                />
              );
            })}
            <circle cx={cx} cy={cy} r={28} fill="#0f1c40" />
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              className="fill-white text-[13px] font-semibold"
            >
              {total}
            </text>
            <text
              x={cx}
              y={cy + 12}
              textAnchor="middle"
              className="fill-slate-500 text-[8px]"
            >
              sessions
            </text>
          </svg>
          <ul className="min-w-0 flex-1 space-y-2">
            {DIFFICULTY_ORDER.map((level) => {
              const count = counts[level] ?? 0;
              if (count === 0) return null;
              const pct = Math.round((count / total) * 100);
              return (
                <li
                  key={level}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="inline-flex items-center gap-2 text-slate-300">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: DIFFICULTY_COLORS[level] }}
                    />
                    {level}
                  </span>
                  <span className="tabular-nums text-slate-500">
                    {count} · {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

type MonthlyChartProps = {
  stats: MonthlyStats[];
};

function monthStackTotal(row: MonthlyStats) {
  return (
    row.founderEntries +
    row.gitCommits +
    row.cursorSessions +
    row.estimatedCursorSessions
  );
}

/** Monthly founder + git + Cursor (logged or estimated) as stacked columns. */
export function MonthlyActivityChart({ stats }: MonthlyChartProps) {
  if (stats.length === 0) return null;

  const maxTotal = Math.max(...stats.map(monthStackTotal), 1);
  const barW = 28;
  const gap = 12;
  const chartW = Math.max(stats.length * (barW + gap) + 32, 320);
  const plotH = 168;
  const padBottom = 36;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-5">
      <h2 className="text-sm font-semibold text-white">Monthly activity</h2>
      <p className="mt-1 text-xs text-slate-400">
        Stacked columns — founder, git, logged Cursor (2026), estimated Cursor (2025).
      </p>
      <div className="mt-4 overflow-x-auto">
        <svg
          width={chartW}
          height={plotH + padBottom}
          className="min-w-full"
          role="img"
          aria-label="Monthly stacked activity chart"
        >
          {stats.map((row, i) => {
            const x = 20 + i * (barW + gap);
            const total = monthStackTotal(row);
            const columnH = total > 0 ? (total / maxTotal) * (plotH - 16) : 0;
            const founderH =
              total > 0 ? (row.founderEntries / total) * columnH : 0;
            const gitH = total > 0 ? (row.gitCommits / total) * columnH : 0;
            const cursorH = total > 0 ? (row.cursorSessions / total) * columnH : 0;
            const estH =
              total > 0 ? (row.estimatedCursorSessions / total) * columnH : 0;
            const baseY = plotH;
            const founderTop = baseY - founderH;
            const gitTop = founderTop - gitH;
            const cursorTop = gitTop - cursorH;
            const estTop = cursorTop - estH;
            const hasEstimate = row.estimatedCursorSessions > 0;

            return (
              <g key={row.month}>
                {founderH > 0 ? (
                  <rect
                    x={x}
                    y={founderTop}
                    width={barW}
                    height={founderH}
                    fill="#fbbf24"
                    opacity={0.9}
                    rx={columnH === founderH ? 3 : 0}
                  />
                ) : null}
                {gitH > 0 ? (
                  <rect
                    x={x}
                    y={gitTop}
                    width={barW}
                    height={gitH}
                    fill="#34d399"
                    opacity={0.92}
                    rx={cursorH <= 0 && estH <= 0 ? 3 : 0}
                  />
                ) : null}
                {cursorH > 0 ? (
                  <rect
                    x={x}
                    y={cursorTop}
                    width={barW}
                    height={cursorH}
                    fill="#38bdf8"
                    opacity={0.92}
                    rx={estH <= 0 ? 3 : 0}
                  />
                ) : null}
                {estH > 0 ? (
                  <rect
                    x={x}
                    y={estTop}
                    width={barW}
                    height={estH}
                    fill="#a78bfa"
                    opacity={0.88}
                    stroke="#c4b5fd"
                    strokeWidth={1}
                    strokeDasharray="3 2"
                    rx={3}
                  />
                ) : null}
                {columnH === 0 ? (
                  <rect
                    x={x}
                    y={baseY - 2}
                    width={barW}
                    height={2}
                    fill="#334155"
                    rx={1}
                  />
                ) : null}
                <text
                  x={x + barW / 2}
                  y={baseY + 14}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px]"
                >
                  {row.month.slice(2)}
                </text>
                {total > 0 ? (
                  <text
                    x={x + barW / 2}
                    y={baseY - columnH - 4}
                    textAnchor="middle"
                    className="fill-slate-400 text-[8px]"
                  >
                    {hasEstimate && row.cursorSessions === 0
                      ? `~${total}`
                      : total}
                  </text>
                ) : null}
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
          <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" />
          Git
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-sky-400" />
          Cursor (logged)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm border border-violet-300 bg-violet-400/80" />
          Cursor est. (2025)
        </span>
      </div>
    </div>
  );
}
