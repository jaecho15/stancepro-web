import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
} from "lucide-react";
import {
  MINIMAP_H,
  MINIMAP_W,
  regionMiniMapPaths,
} from "@/lib/snow/region-minimap";
import type { SeasonalOutlookRow, SeasonalSignal } from "@/lib/snow/types";

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

function RegionMiniMap({ row, lean }: { row: SeasonalOutlookRow; lean: LeanKey }) {
  const paths = regionMiniMapPaths(row.region_ids);
  if (!paths) return null;
  return (
    <svg
      viewBox={`0 0 ${MINIMAP_W} ${MINIMAP_H}`}
      className="w-[104px] h-[70px] shrink-0 rounded-xl bg-slate-800/80 border border-slate-700/60"
      aria-hidden
    >
      {/* faint graticule so lone shapes still read as a map */}
      {[1, 2].map((i) => (
        <line
          key={`h${i}`}
          x1="0"
          y1={(MINIMAP_H / 3) * i}
          x2={MINIMAP_W}
          y2={(MINIMAP_H / 3) * i}
          className="stroke-slate-700/50"
          strokeWidth="0.5"
        />
      ))}
      {[1, 2, 3].map((i) => (
        <line
          key={`v${i}`}
          x1={(MINIMAP_W / 4) * i}
          y1="0"
          x2={(MINIMAP_W / 4) * i}
          y2={MINIMAP_H}
          className="stroke-slate-700/50"
          strokeWidth="0.5"
        />
      ))}
      {paths.map((d, i) => (
        <path key={i} d={d} className={LEAN[lean].map} strokeWidth="0.8" />
      ))}
    </svg>
  );
}

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

export function SeasonalOutlookCard({
  row,
  compact = false,
}: {
  row: SeasonalOutlookRow;
  compact?: boolean;
}) {
  const { payload, enso_state } = row;
  const signal = payload.signal;
  const lean: LeanKey = signal?.lean ?? "near";
  const ensoName = ENSO_LABEL[enso_state.state] ?? enso_state.state;

  return (
    <div
      className={`glass rounded-2xl p-6 space-y-4 border-l-2 ${LEAN[lean].accent}`}
    >
      {/* Header: title + season + lean headline, region mini-map on the right */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Seasonal outlook · Winter {row.target_season}
          </p>
          <h3 className="text-xl font-bold text-white mt-0.5">{row.label}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-sm font-semibold ${LEAN[lean].text}`}>
              {signal ? LEAN[lean].sentence : "Near normal expected"}
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full ${LEAN[lean].tint} ${LEAN[lean].text}`}
            >
              {signal ? `${signal.confidence} confidence` : "trend only"}
            </span>
          </div>
        </div>
        <RegionMiniMap row={row} lean={lean} />
      </div>

      <Divider />
      <TrendRow row={row} />

      {signal ? (
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
        Niño3.4 {enso_state.nino34 > 0 ? "+" : ""}
        {enso_state.nino34.toFixed(2)} · {ensoName}
        {enso_state.strength !== "none" ? ` (${enso_state.strength})` : ""}
        {enso_state.latest_season ? ` · as of ${enso_state.latest_season}` : ""}
        {row.generated_at ? ` · updated ${row.generated_at.slice(0, 10)}` : ""}
      </p>
    </div>
  );
}
