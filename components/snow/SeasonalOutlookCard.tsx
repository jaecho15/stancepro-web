import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
} from "lucide-react";
import { regionContext } from "@/lib/snow/region-context";
import { ordinal, statusHeadline, statusLean } from "@/lib/snow/season-status";
import type {
  SeasonalHistoryBaseline,
  SeasonalHistoryPoint,
  SeasonalOutlookRow,
  SeasonalSignal,
  SeasonalSnowlineBaseline,
  SeasonalSnowlinePoint,
  SeasonalSnowlineTrend,
  SeasonalStatus,
} from "@/lib/snow/types";

// 4-layer seasonal card — web counterpart of the app's SeasonalOutlookCard
// (trend / ENSO signal + tercile bar / analog years / experimental watch),
// plus a region mini-map derived from the subregion boundaries.

const LEAN = {
  above: {
    sentence: "Leaning above normal",
    text: "text-sky-300",
    tint: "bg-sky-500/15",
    accent: "border-sky-400/50",
    map: "fill-sky-400/70 stroke-sky-300",
    dot: "bg-sky-400",
  },
  below: {
    sentence: "Leaning below normal",
    text: "text-amber-300",
    tint: "bg-amber-500/15",
    accent: "border-amber-400/50",
    map: "fill-amber-400/70 stroke-amber-300",
    dot: "bg-amber-400",
  },
  near: {
    sentence: "Near normal",
    text: "text-slate-300",
    tint: "bg-slate-500/20",
    accent: "border-slate-500/50",
    map: "fill-slate-400/60 stroke-slate-300",
    dot: "bg-slate-400",
  },
} as const;

type LeanKey = keyof typeof LEAN;

const ENSO_LABEL: Record<string, string> = {
  la_nina: "La Niña",
  el_nino: "El Niño",
  neutral: "ENSO-neutral",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

function TrendRow({ row }: { row: SeasonalOutlookRow }) {
  const trend = row.payload.trend;
  const magnitude = Math.abs(Math.round(trend.pct_per_decade));
  const [Icon, text, color] =
    trend.direction === "increasing"
      ? [ArrowUpRight, `Snowfall trending up ~${magnitude}% per decade`, "text-emerald-400"]
      : trend.direction === "decreasing"
        ? [ArrowDownRight, `Snowfall trending down ~${magnitude}% per decade`, "text-orange-400"]
        : [ArrowRight, "Snowfall roughly stable decade to decade", "text-slate-400"];
  return (
    <div className="flex items-center gap-3">
      <Icon className={`w-4 h-4 shrink-0 ${color}`} />
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Long-term trend</p>
        <p className="text-sm text-slate-200">{text}</p>
      </div>
    </div>
  );
}

function TercileBar({ signal }: { signal: SeasonalSignal }) {
  const p = signal.probabilities;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400 mb-1.5">
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${LEAN.above.dot}`} />
          More snow {pct(p.above)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${LEAN.near.dot}`} />
          Normal {pct(p.near)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${LEAN.below.dot}`} />
          Less snow {pct(p.below)}
        </span>
      </div>
      <div className="relative">
        <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-800">
          <div className="bg-sky-500/90" style={{ width: pct(p.above) }} />
          <div className="bg-slate-600" style={{ width: pct(p.near) }} />
          <div className="bg-amber-500/90" style={{ width: pct(p.below) }} />
        </div>
        {/* climatology reference: even thirds */}
        <div className="absolute inset-y-0 left-1/3 w-px bg-slate-950/70" />
        <div className="absolute inset-y-0 left-2/3 w-px bg-slate-950/70" />
      </div>
      <p className="text-[11px] text-slate-600 mt-1">
        Ticks mark the 33/33/33 climatology baseline
      </p>
    </div>
  );
}

function Analogs({ signal, enso }: { signal: SeasonalSignal; enso: string }) {
  const s = signal.analog_summary;
  const bucketStyle = (b: "above" | "near" | "below") =>
    `${LEAN[b].tint} ${LEAN[b].text}`;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">
        Similar {enso} winters
      </p>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {signal.analogs.map((analog) => (
          <span
            key={analog.year}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${bucketStyle(analog.bucket)}`}
            title={`${analog.pct > 0 ? "+" : ""}${analog.pct.toFixed(1)}% vs normal · Niño3.4 ${analog.nino34.toFixed(2)} · PDO ${analog.pdo.toFixed(2)}`}
          >
            {analog.year}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {s.above} above · {s.near} near · {s.below} below — analog mean{" "}
        {s.mean_pct >= 0 ? "+" : ""}
        {Math.round(s.mean_pct)}%
      </p>
    </div>
  );
}

const Divider = () => <div className="border-t border-slate-700/50" />;

// Year-by-year record: completed-season modeled snowfall (ERA5) as a line with
// the normal range (p10–p90) shaded and the median dashed. Pure SVG so it
// renders server-side. The in-progress season is intentionally omitted — a
// partial total isn't comparable to full-season totals (StatusSection places
// it among the record via the percentile gauge instead).
function HistoryChart({
  history,
  baseline,
}: {
  history: SeasonalHistoryPoint[];
  baseline: SeasonalHistoryBaseline | null;
}) {
  const W = 320;
  const H = 116;
  const padL = 4;
  const padR = 4;
  const padT = 10;
  const padB = 16;
  const minYear = Math.min(...history.map((p) => p.year));
  const maxYear = Math.max(...history.map((p) => p.year));
  const yMax =
    Math.max(baseline?.p90_cm ?? 0, ...history.map((p) => p.snow_cm)) * 1.08 || 1;
  const x = (yr: number) =>
    padL + ((yr - minYear) / (maxYear - minYear || 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);
  const linePath = history
    .map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)},${y(p.snow_cm).toFixed(1)}`)
    .join(" ");
  const dotColor = (v: number) =>
    baseline && v >= baseline.p90_cm
      ? "#38bdf8"
      : baseline && v <= baseline.p10_cm
        ? "#fbbf24"
        : "#7dd3fc";

  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">
        Year-by-year record
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Modeled season-total snowfall by year"
      >
        {baseline && (
          <rect
            x={padL}
            width={W - padL - padR}
            y={y(baseline.p90_cm)}
            height={Math.max(0, y(baseline.p10_cm) - y(baseline.p90_cm))}
            fill="#64748b"
            fillOpacity="0.14"
          />
        )}
        {baseline && (
          <line
            x1={padL}
            x2={W - padR}
            y1={y(baseline.median_cm)}
            y2={y(baseline.median_cm)}
            stroke="#94a3b8"
            strokeWidth="0.6"
            strokeDasharray="3 3"
          />
        )}
        <path
          d={linePath}
          fill="none"
          stroke="#38bdf8"
          strokeOpacity="0.55"
          strokeWidth="1.3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {history.map((p) => (
          <circle key={p.year} cx={x(p.year)} cy={y(p.snow_cm)} r="1.3" fill={dotColor(p.snow_cm)} />
        ))}
        {baseline && (
          <text
            x={W - padR}
            y={y(baseline.median_cm) - 2}
            textAnchor="end"
            fontSize="7"
            fill="#94a3b8"
          >
            median {baseline.median_cm} cm
          </text>
        )}
        <text x={padL} y={H - 4} fontSize="7.5" fill="#64748b">
          {minYear}
        </text>
        <text x={W - padR} y={H - 4} textAnchor="end" fontSize="7.5" fill="#64748b">
          {maxYear}
        </text>
      </svg>
      <p className="text-[11px] text-slate-600 mt-1">
        Modeled season-total snowfall · ERA5 reanalysis · shaded band = normal range
        (10th–90th percentile). Mid-elevation snowfall input, not snowpack or season
        length.
      </p>
    </div>
  );
}

// Winter rain/snow-line elevation, from the same ERA5 pull as the snowfall
// history. A SECOND stacked panel (shared year axis, its own metres axis — never
// a dual axis): mid-elevation snowfall totals look flat under warming, but the
// snow line rises. The dashed OLS fit + trend badge carry the honest signal;
// absolute metres are modeled (assumed lapse rate).
function SnowlineChart({
  snowline,
  baseline,
  trend,
}: {
  snowline: SeasonalSnowlinePoint[];
  baseline: SeasonalSnowlineBaseline | null;
  trend: SeasonalSnowlineTrend | null;
}) {
  const W = 320;
  const H = 116;
  const padL = 4;
  const padR = 4;
  const padT = 10;
  const padB = 16;
  const minYear = Math.min(...snowline.map((p) => p.year));
  const maxYear = Math.max(...snowline.map((p) => p.year));
  const vals = snowline.map((p) => p.snowline_m);
  const lo = Math.min(baseline?.p10_m ?? Infinity, ...vals);
  const hi = Math.max(baseline?.p90_m ?? -Infinity, ...vals);
  const span = hi - lo || 100;
  const yMin = Math.max(0, lo - span * 0.12);
  const yMax = hi + span * 0.12;
  const x = (yr: number) =>
    padL + ((yr - minYear) / (maxYear - minYear || 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - padT - padB);
  const linePath = snowline
    .map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)},${y(p.snowline_m).toFixed(1)}`)
    .join(" ");
  // OLS fit for the trend overlay (endpoints only).
  const n = snowline.length;
  const mx = snowline.reduce((a, p) => a + p.year, 0) / n;
  const my = vals.reduce((a, v) => a + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of snowline) {
    sxx += (p.year - mx) ** 2;
    sxy += (p.year - mx) * (p.snowline_m - my);
  }
  const slope = sxx ? sxy / sxx : 0;
  const fit = (yr: number) => my + slope * (yr - mx);
  const dir = trend?.direction ?? "stable";
  const perDecade = Math.abs(Math.round(trend?.m_per_decade ?? 0));
  const [BadgeIcon, badgeText, badgeColor] =
    dir === "rising"
      ? [ArrowUpRight, `Snow line rising ~${perDecade} m per decade`, "text-orange-400"]
      : dir === "falling"
        ? [ArrowDownRight, `Snow line falling ~${perDecade} m per decade`, "text-sky-400"]
        : [ArrowRight, "Snow line roughly stable decade to decade", "text-slate-400"];

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">
          Winter snow line
        </p>
        <span className={`flex items-center gap-1 text-[11px] font-medium ${badgeColor}`}>
          <BadgeIcon className="w-3 h-3 shrink-0" />
          {badgeText}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Modeled winter rain/snow-line elevation by year"
      >
        {baseline && (
          <rect
            x={padL}
            width={W - padL - padR}
            y={y(baseline.p90_m)}
            height={Math.max(0, y(baseline.p10_m) - y(baseline.p90_m))}
            fill="#64748b"
            fillOpacity="0.14"
          />
        )}
        {baseline && (
          <line
            x1={padL}
            x2={W - padR}
            y1={y(baseline.median_m)}
            y2={y(baseline.median_m)}
            stroke="#94a3b8"
            strokeWidth="0.6"
            strokeDasharray="3 3"
          />
        )}
        <path
          d={linePath}
          fill="none"
          stroke="#cbd5e1"
          strokeOpacity="0.7"
          strokeWidth="1.3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {snowline.map((p) => (
          <circle key={p.year} cx={x(p.year)} cy={y(p.snowline_m)} r="1.3" fill="#e2e8f0" />
        ))}
        {dir !== "stable" && (
          <line
            x1={x(minYear)}
            x2={x(maxYear)}
            y1={y(fit(minYear))}
            y2={y(fit(maxYear))}
            stroke={dir === "rising" ? "#fb923c" : "#38bdf8"}
            strokeWidth="1.6"
            strokeDasharray="5 3"
            strokeLinecap="round"
          />
        )}
        {baseline && (
          <text
            x={W - padR}
            y={y(baseline.median_m) - 2}
            textAnchor="end"
            fontSize="7"
            fill="#94a3b8"
          >
            median {baseline.median_m} m
          </text>
        )}
        <text x={padL} y={H - 4} fontSize="7.5" fill="#64748b">
          {minYear}
        </text>
        <text x={W - padR} y={H - 4} textAnchor="end" fontSize="7.5" fill="#64748b">
          {maxYear}
        </text>
      </svg>
      <p className="text-[11px] text-slate-600 mt-1">
        Where winter days cross the rain/snow threshold · ERA5 reanalysis. The line
        tracks temperature, so it rises under warming even where snowfall looks flat.
        Metres are modeled (assumed lapse rate); the trend is the signal.
      </p>
    </div>
  );
}

// Observed season-so-far block for southern-hemisphere in-progress winters:
// percentile gauge, season-to-date vs climatology, recent-two-week tendency,
// satellite snow cover. Facts only — no probabilities.
function StatusSection({ status }: { status: SeasonalStatus }) {
  const lean = statusLean(status);
  const tendencyColor = LEAN[status.tendency].text;
  const cover = status.snow_cover;
  return (
    <div className="space-y-3">
      <div>
        <div className="relative h-2.5 rounded-full overflow-hidden bg-slate-800">
          <div className="absolute inset-y-0 left-0 w-1/3 bg-amber-500/25" />
          <div className="absolute inset-y-0 left-1/3 w-1/3 bg-slate-600/40" />
          <div className="absolute inset-y-0 left-2/3 w-1/3 bg-sky-500/25" />
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${LEAN[lean].dot}`}
            style={{ left: `${Math.min(Math.max(status.percentile, 2), 98)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-slate-600 mt-1">
          <span>Drier winters</span>
          <span className={`${LEAN[lean].text} font-medium`}>
            {ordinal(status.percentile)} percentile of 35 winters
          </span>
          <span>Snowier winters</span>
        </div>
      </div>

      <p className="text-sm text-slate-200">
        {status.season_to_date_cm} cm since June 1
        <span className="text-slate-500"> · median by this date {status.climatology_median_cm} cm</span>
      </p>

      <p className="text-sm text-slate-300">
        Last 14 days: {status.last14d_cm} cm vs {status.last14d_median_cm} cm typical —{" "}
        <span className={`font-medium ${tendencyColor}`}>
          {status.tendency === "above"
            ? "trending snowier"
            : status.tendency === "below"
              ? "trending drier"
              : "about typical"}
        </span>
      </p>

      {cover && cover.covered + cover.partial + cover.bare > 0 && (
        <p className="text-xs text-slate-500">
          Satellite snow cover: {cover.covered} covered · {cover.partial} partial ·{" "}
          {cover.bare} bare
        </p>
      )}
    </div>
  );
}

export function SeasonalOutlookCard({
  row,
  compact = false,
  index,
}: {
  row: SeasonalOutlookRow;
  compact?: boolean;
  index?: number;
}) {
  const { payload, enso_state } = row;
  const signal = payload.signal;
  const status =
    payload.mode === "in_season_status" && payload.status ? payload.status : null;
  const lean: LeanKey = signal?.lean ?? (status ? statusLean(status) : "near");
  const ensoName = enso_state ? (ENSO_LABEL[enso_state.state] ?? enso_state.state) : "";
  const context = regionContext(row.climate_region, row.region_ids);

  return (
    <div
      className={`glass rounded-2xl p-6 space-y-4 border-l-2 ${LEAN[lean].accent}`}
    >
      {/* Header: title + season + lean headline, region mini-map on the right */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            {status ? "Season status" : "Seasonal outlook"} · Winter {row.target_season}
          </p>
          <h3 className="text-xl font-bold text-white mt-0.5 flex items-center gap-2">
            {index !== undefined && (
              <span
                className={`w-6 h-6 rounded-full text-[13px] font-semibold text-slate-900 inline-flex items-center justify-center shrink-0 ${
                  lean === "above" ? "bg-sky-400" : lean === "below" ? "bg-amber-400" : "bg-slate-400"
                }`}
              >
                {index}
              </span>
            )}
            {row.label}
          </h3>
          {context.subtitle && (
            <p className="text-xs text-slate-400 mt-0.5">
              {context.flags} {context.subtitle}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-sm font-semibold ${LEAN[lean].text}`}>
              {status
                ? statusHeadline(status)
                : signal
                  ? LEAN[lean].sentence
                  : "Near normal expected"}
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full ${LEAN[lean].tint} ${LEAN[lean].text}`}
            >
              {status
                ? "observed · in progress"
                : signal
                  ? `${signal.confidence} confidence`
                  : "trend only"}
            </span>
          </div>
        </div>
      </div>

      <Divider />
      <TrendRow row={row} />

      {!compact && payload.history && payload.history.length > 1 && (
        <>
          <Divider />
          <HistoryChart
            history={payload.history}
            baseline={payload.history_baseline ?? null}
          />
        </>
      )}

      {!compact && payload.snowline_history && payload.snowline_history.length > 1 && (
        <>
          <Divider />
          <SnowlineChart
            snowline={payload.snowline_history}
            baseline={payload.snowline_baseline ?? null}
            trend={payload.snowline_trend ?? null}
          />
        </>
      )}

      {status ? (
        <>
          <Divider />
          <StatusSection status={status} />
          <p className="text-[11px] text-slate-600">
            Observed conditions, not a forecast — reanalysis snowfall averaged
            over {status.points} sample resort{status.points === 1 ? "" : "s"},
            as of {status.asof}.
          </p>
        </>
      ) : signal ? (
        <>
          <Divider />
          <TercileBar signal={signal} />
          {!compact && signal.analogs.length > 0 && (
            <>
              <Divider />
              <Analogs signal={signal} enso={ensoName} />
            </>
          )}
          <p className="text-[11px] text-slate-600">
            Probabilities from the validated ENSO relationship for this region,
            verified against 40+ years of winters.
          </p>
        </>
      ) : (
        <>
          <Divider />
          <p className="text-sm text-slate-400">
            No validated seasonal signal for this region this year — the
            long-term trend above is the honest forecast.
          </p>
        </>
      )}

      {!compact &&
        payload.watch.map((factor) => (
          <div key={factor.factor}>
            <Divider />
            <div className="flex items-start gap-3 mt-4">
              <FlaskConical className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Watch · experimental
                </p>
                <p className="text-sm text-slate-200 mt-0.5">{factor.detail}</p>
                <p className="text-xs text-slate-500 mt-0.5">{factor.note}</p>
              </div>
            </div>
          </div>
        ))}

      <p className="text-[11px] text-slate-600">
        {enso_state && typeof enso_state.nino34 === "number" && !status && (
          <>
            Niño3.4 {enso_state.nino34 > 0 ? "+" : ""}
            {enso_state.nino34.toFixed(2)} · {ensoName}
            {enso_state.strength !== "none" ? ` (${enso_state.strength})` : ""}
            {enso_state.latest_season ? ` · as of ${enso_state.latest_season}` : ""}
          </>
        )}
        {row.generated_at
          ? `${!status && enso_state && typeof enso_state.nino34 === "number" ? " · " : ""}updated ${row.generated_at.slice(0, 10)}`
          : ""}
      </p>
    </div>
  );
}
