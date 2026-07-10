import { TrendingDown, TrendingUp, Minus, Eye } from "lucide-react";
import type { SeasonalOutlookRow } from "@/lib/snow/types";

// 4-layer seasonal card: trend (always) / validated ENSO signal / analog
// years / experimental watch — same layering as the iOS SeasonalOutlookCard.

const LEAN_LABEL: Record<string, string> = {
  above: "leaning snowier",
  below: "leaning leaner",
  near: "near normal",
};

const ENSO_LABEL: Record<string, string> = {
  la_nina: "La Niña",
  el_nino: "El Niño",
  neutral: "ENSO-neutral",
};

function TrendLine({ row }: { row: SeasonalOutlookRow }) {
  const trend = row.payload.trend;
  const Icon =
    trend.direction === "increasing"
      ? TrendingUp
      : trend.direction === "decreasing"
        ? TrendingDown
        : Minus;
  const color =
    trend.direction === "increasing"
      ? "text-emerald-400"
      : trend.direction === "decreasing"
        ? "text-orange-400"
        : "text-slate-400";
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-sm text-slate-300">
        Long-term trend:{" "}
        <span className={`font-semibold ${color}`}>
          {trend.pct_per_decade > 0 ? "+" : ""}
          {trend.pct_per_decade.toFixed(1)}% / decade
        </span>
      </span>
    </div>
  );
}

function ProbabilityBar({ row }: { row: SeasonalOutlookRow }) {
  const signal = row.payload.signal;
  if (!signal) return null;
  const p = signal.probabilities;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-800">
        <div className="bg-sky-500/80" style={{ width: pct(p.above) }} />
        <div className="bg-slate-600" style={{ width: pct(p.near) }} />
        <div className="bg-amber-500/80" style={{ width: pct(p.below) }} />
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1.5">
        <span className="text-sky-400">Above {pct(p.above)}</span>
        <span>Near {pct(p.near)}</span>
        <span className="text-amber-400">Below {pct(p.below)}</span>
      </div>
    </div>
  );
}

const BUCKET_STYLE: Record<string, string> = {
  above: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  near: "bg-slate-600/20 text-slate-300 border-slate-500/30",
  below: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

export function SeasonalOutlookCard({
  row,
  compact = false,
}: {
  row: SeasonalOutlookRow;
  compact?: boolean;
}) {
  const { payload, enso_state } = row;
  const signal = payload.signal;

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-white">{row.label}</h3>
          <p className="text-xs text-slate-500">Winter {row.target_season}</p>
        </div>
        {signal ? (
          <span
            className={`text-xs px-2.5 py-1 rounded-full border ${BUCKET_STYLE[signal.lean] ?? BUCKET_STYLE.near}`}
          >
            {LEAN_LABEL[signal.lean] ?? signal.lean} · {signal.confidence} confidence
          </span>
        ) : (
          <span className="text-xs px-2.5 py-1 rounded-full border border-slate-600/50 text-slate-400">
            trend only
          </span>
        )}
      </div>

      <TrendLine row={row} />

      {signal && (
        <>
          <ProbabilityBar row={row} />
          {!compact && signal.analogs.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                Similar {ENSO_LABEL[enso_state.state] ?? enso_state.state} winters
              </p>
              <div className="flex flex-wrap gap-1.5">
                {signal.analogs.map((analog) => (
                  <span
                    key={analog.year}
                    className={`text-xs px-2 py-1 rounded-lg border ${BUCKET_STYLE[analog.bucket]}`}
                    title={`Niño3.4 ${analog.nino34.toFixed(2)} · PDO ${analog.pdo.toFixed(2)} · ${analog.pct > 0 ? "+" : ""}${analog.pct.toFixed(1)}% vs normal`}
                  >
                    {analog.year} {analog.pct > 0 ? "+" : ""}
                    {Math.round(analog.pct)}%
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {signal.analog_summary.above} above · {signal.analog_summary.near} near ·{" "}
                {signal.analog_summary.below} below (mean{" "}
                {signal.analog_summary.mean_pct > 0 ? "+" : ""}
                {signal.analog_summary.mean_pct.toFixed(1)}%)
              </p>
            </div>
          )}
        </>
      )}

      {!compact &&
        payload.watch.map((factor) => (
          <div
            key={factor.factor}
            className="rounded-xl border border-purple-500/25 bg-purple-500/10 p-3"
          >
            <p className="text-xs text-purple-300 flex items-center gap-1.5 mb-1">
              <Eye className="w-3.5 h-3.5" /> Watch (experimental)
            </p>
            <p className="text-sm text-slate-300">{factor.detail}</p>
            <p className="text-xs text-slate-500 mt-1">{factor.note}</p>
          </div>
        ))}

      <p className="text-xs text-slate-600">
        Niño3.4 {enso_state.nino34 > 0 ? "+" : ""}
        {enso_state.nino34.toFixed(2)} · {ENSO_LABEL[enso_state.state] ?? enso_state.state}
        {enso_state.strength !== "none" ? ` (${enso_state.strength})` : ""}
        {row.generated_at ? ` · updated ${row.generated_at.slice(0, 10)}` : ""}
      </p>
    </div>
  );
}
