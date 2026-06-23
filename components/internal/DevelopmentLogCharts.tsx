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
};

/** Total Cursor session mix by difficulty (pie). */
export function DifficultyChart({ counts, total }: DifficultyChartProps) {
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
        Cursor human sessions · {total} total
      </p>
      {total === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No sessions in current filters.</p>
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

/** Monthly founder + Cursor activity as stacked columns. */
export function MonthlyActivityChart({ stats }: MonthlyChartProps) {
  if (stats.length === 0) return null;

  const maxTotal = Math.max(
    ...stats.map((s) => s.founderEntries + s.cursorSessions),
    1
  );
  const barW = 28;
  const gap = 12;
  const chartW = Math.max(stats.length * (barW + gap) + 32, 320);
  const plotH = 168;
  const padBottom = 36;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 p-5">
      <h2 className="text-sm font-semibold text-white">Monthly activity</h2>
      <p className="mt-1 text-xs text-slate-400">
        Stacked columns — founder (bottom) + Cursor sessions (top) per month.
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
            const total = row.founderEntries + row.cursorSessions;
            const columnH = total > 0 ? (total / maxTotal) * (plotH - 16) : 0;
            const founderH =
              total > 0 ? (row.founderEntries / total) * columnH : 0;
            const cursorH = columnH - founderH;
            const baseY = plotH;

            return (
              <g key={row.month}>
                {founderH > 0 ? (
                  <rect
                    x={x}
                    y={baseY - founderH}
                    width={barW}
                    height={founderH}
                    fill="#fbbf24"
                    opacity={0.9}
                    rx={total === row.founderEntries ? 3 : 0}
                  />
                ) : null}
                {cursorH > 0 ? (
                  <rect
                    x={x}
                    y={baseY - columnH}
                    width={barW}
                    height={cursorH}
                    fill="#38bdf8"
                    opacity={0.92}
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
                    {total}
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
          Founder (bottom)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-sky-400" />
          Cursor (top)
        </span>
      </div>
    </div>
  );
}
