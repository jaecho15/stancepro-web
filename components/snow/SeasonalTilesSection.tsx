import Link from "next/link";
import { ChevronRight, Snowflake } from "lucide-react";
import { regionContext } from "@/lib/snow/region-context";
import { isSeasonStatus, ordinal, statusLean } from "@/lib/snow/season-status";
import type { SeasonalOutlookRow } from "@/lib/snow/types";

// "This winter's outlook" strip on the snow-forecast landing — web counterpart
// of the app's SeasonalOutlookSection (driver line + tappable region tiles).
// Signal regions lead, then southern in-season status, then trend/history-only
// regions (climate-trend badge). Tiles link to the region's card.
// Columns adapt to screen width (auto-fill) instead of the app's fixed two.

const LEAN_STYLE: Record<string, string> = {
  above: "bg-sky-500/15 text-sky-300",
  below: "bg-amber-500/15 text-amber-300",
  near: "bg-slate-500/20 text-slate-300",
};

const TREND_STYLE = "bg-slate-500/10 text-slate-400 border border-slate-500/30";

const LEAN_TEXT: Record<string, string> = {
  above: "Leaning above normal",
  below: "Leaning below normal",
  near: "Near normal",
};

const ENSO_LABEL: Record<string, string> = {
  la_nina: "La Niña",
  el_nino: "El Niño",
  neutral: "ENSO-neutral",
};

// One-line shared driver, e.g. "El Niño (Niño3.4 +1.0) → Leaning below normal"
// — mirrors the app's seasonalDriverText.
function driverText(rows: SeasonalOutlookRow[]): string | null {
  const enso = rows[0]?.enso_state;
  if (!enso) return null;
  const leans = rows
    .map((row) => row.payload.signal?.lean)
    .filter((lean): lean is "above" | "below" | "near" => !!lean);
  const below = leans.filter((l) => l === "below").length;
  const above = leans.filter((l) => l === "above").length;
  const lean = below > above ? "below" : above > below ? "above" : "near";
  const nino = `${enso.nino34 >= 0 ? "+" : ""}${enso.nino34.toFixed(1)}`;
  return `${ENSO_LABEL[enso.state] ?? enso.state} (Niño3.4 ${nino}) → ${LEAN_TEXT[lean]}`;
}

export function SeasonalTilesSection({ rows }: { rows: SeasonalOutlookRow[] }) {
  // Mutually exclusive groups — a southern region can carry both a signal and
  // an in-season status; it gets one tile (status wins in the tile render).
  const signalRows = rows.filter((row) => row.payload.signal);
  const statusRows = rows.filter(
    (row) => !row.payload.signal && isSeasonStatus(row),
  );
  const trendRows = rows
    .filter((row) => !row.payload.signal && !isSeasonStatus(row))
    .sort((a, b) => a.label.localeCompare(b.label));
  const tiles = [...signalRows, ...statusRows, ...trendRows];
  if (tiles.length === 0) return null;
  const driver = driverText(signalRows);

  return (
    <section className="mb-10">
      <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-2">
        This winter&apos;s outlook
      </h2>
      {driver && (
        <p className="flex items-center gap-2 text-sm text-slate-400 mb-3">
          <Snowflake className="w-3.5 h-3.5 text-brand-400 shrink-0" />
          {driver}
        </p>
      )}
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
        {tiles.map((row) => {
          const status = isSeasonStatus(row) ? row.payload.status! : null;
          const signal = row.payload.signal;
          const lean = status ? statusLean(status) : signal?.lean ?? null;
          return (
            <Link
              key={row.climate_region}
              href={`/snow-forecast?region=${encodeURIComponent(row.climate_region)}`}
              className="glass rounded-xl p-4 flex flex-col gap-2 border border-transparent hover:border-brand-500/50 transition-all"
            >
              <span className="flex items-start justify-between gap-1">
                <span className="text-sm font-semibold text-white leading-tight">
                  {regionContext(row.climate_region, row.region_ids).flags}{" "}
                  {row.label}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
              </span>
              <span
                className={`self-start text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  lean ? LEAN_STYLE[lean] : TREND_STYLE
                }`}
              >
                {status
                  ? `${ordinal(status.percentile)} pctile so far`
                  : lean
                    ? LEAN_TEXT[lean]
                    : "Climate trend"}
              </span>
              <span className="text-[11px] text-slate-500">
                {status
                  ? "season in progress · observed"
                  : signal
                    ? `${signal.confidence} confidence`
                    : "trend & history"}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Colored badges show the validated winter outlook; southern regions show
        the season so far; the rest show long-term climate trend &amp; history
        —{" "}
        <Link href="/snow-forecast" className="text-brand-400 hover:text-brand-300">
          full seasonal outlook →
        </Link>
      </p>
    </section>
  );
}
