import { ChevronDown, Wind } from "lucide-react";
import {
  CLIMATE_CAUTION,
  regionClimate,
  RESORT_CAVEAT,
  WHAT_TO_LOOK_FOR,
} from "@/lib/snow/region-climate";

// Collapsible "why it snows here" reference for a browse region. Historical
// climate description — explicitly not a forecast. Native <details> so it
// renders server-side and needs no client state.
export function RegionClimateNotes({ regionId }: { regionId: string | null }) {
  const c = regionClimate(regionId);
  if (!c) return null;

  return (
    <details className="glass rounded-2xl p-5 group">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-white flex items-center gap-2">
          <Wind className="w-4 h-4 text-brand-400" />
          Regional snowfall climate — why it snows here
        </span>
        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-300">{c.summary}</p>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
            Main historical influences
          </p>
          <ul className="space-y-3">
            {c.factors.map((f) => (
              <li key={f.indicator}>
                <p className="text-sm font-medium text-slate-100">{f.indicator}</p>
                <p className="text-sm text-slate-400 mt-0.5">{f.mechanism}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className="text-amber-400/80 font-medium">Read with care: </span>
                  {f.caveat}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
            What to look for in the historical data
          </p>
          <ul className="list-disc pl-4 space-y-1 text-sm text-slate-400">
            {WHAT_TO_LOOK_FOR.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500">{RESORT_CAVEAT}</p>
        <p className="text-[11px] text-slate-600 border-t border-slate-700/50 pt-3">
          {CLIMATE_CAUTION}
        </p>
      </div>
    </details>
  );
}
