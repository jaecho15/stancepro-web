import { CableCar, Mountain, Route, Ruler } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DIFFICULTY_COLOR,
  DIFFICULTY_LABEL,
  type ResortFacilityStats,
} from "@/lib/snow/resort-facility";

function fmtKm(km: number): string {
  return km >= 10 ? `${Math.round(km)}` : km.toFixed(1);
}

function StatCard({
  icon: Icon,
  value,
  unit,
  label,
  sub,
}: {
  icon: LucideIcon;
  value: string;
  unit?: string;
  label: string;
  sub?: string | null;
}) {
  return (
    <div className="glass rounded-xl p-4 flex items-center gap-3">
      <Icon className="w-5 h-5 text-brand-400 shrink-0" />
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none">
          {value}
          {unit && <span className="text-base font-semibold text-slate-400"> {unit}</span>}
        </div>
        <div className="text-sm text-slate-400 mt-1">{label}</div>
        {sub && <span className="text-xs text-slate-500 truncate block">{sub}</span>}
      </div>
    </div>
  );
}

export function ResortFacilityStatsCard({ stats }: { stats: ResortFacilityStats }) {
  const totalRuns = stats.difficulty.reduce((s, d) => s + d.count, 0) || stats.runCount || 1;
  // Percentages are of the full distribution; hide slivers that round to 0%.
  const diff = stats.difficulty.filter((d) => Math.round((d.count / totalRuns) * 100) > 0);

  const g = stats.liftsByGroup;
  const liftSub = [
    g.aerial ? `${g.aerial} gondola/cable` : null,
    g.chair ? `${g.chair} chairlift${g.chair > 1 ? "s" : ""}` : null,
    g.surface ? `${g.surface} surface` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-6 border-t border-slate-700/40 pt-6">
      <div className="grid grid-cols-2 gap-3 mb-5">
        {stats.liftCount > 0 && (
          <StatCard
            icon={CableCar}
            value={`${stats.liftCount}`}
            label={`Lift${stats.liftCount === 1 ? "" : "s"}`}
            sub={liftSub || null}
          />
        )}
        {stats.runCount > 0 && (
          <StatCard
            icon={Route}
            value={`${stats.runCount}`}
            label={`Run${stats.runCount === 1 ? "" : "s"}`}
          />
        )}
        {stats.totalRunKm > 0 && (
          <StatCard
            icon={Ruler}
            value={fmtKm(stats.totalRunKm)}
            unit="km"
            label="Piste length"
          />
        )}
        {stats.longestRunKm > 0 && (
          <StatCard
            icon={Mountain}
            value={fmtKm(stats.longestRunKm)}
            unit="km"
            label="Longest run"
            sub={stats.longestRunName ?? null}
          />
        )}
      </div>

      {/* Difficulty shown as a percentage mix (proportion), so it reads as a
          terrain indicator rather than a count — consistent even on verified
          cards whose official run total differs from the OSM segment counts. */}
      {diff.length > 0 && (
        <div>
          <div className="text-sm text-slate-400 mb-2">Difficulty mix</div>
          <div className="flex h-3 rounded-full overflow-hidden mb-3">
            {diff.map((d) => {
              const pct = Math.round((d.count / totalRuns) * 100);
              return (
                <div
                  key={d.key}
                  style={{
                    width: `${(d.count / totalRuns) * 100}%`,
                    backgroundColor: DIFFICULTY_COLOR[d.key],
                  }}
                  title={`${DIFFICULTY_LABEL[d.key]}: ${pct}%`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {diff.map((d) => (
              <div key={d.key} className="flex items-center gap-1.5 text-xs text-slate-400">
                <span
                  className="w-2.5 h-2.5 rounded-full ring-1 ring-white/20"
                  style={{ backgroundColor: DIFFICULTY_COLOR[d.key] }}
                />
                {DIFFICULTY_LABEL[d.key]}
                <span className="text-slate-500">{Math.round((d.count / totalRuns) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-600 mt-5">
        {stats.verified
          ? `Headline figures — ${
              stats.source ?? "editorially curated (StancePro)"
            }${diff.length > 0 ? "; difficulty mix from OpenStreetMap" : ""}.`
          : "Lifts and pistes from OpenStreetMap piste & aerialway data — the same source as the app's 3D map. Figures reflect mapped data and can differ from official numbers; large linked ski areas may include connected sectors."}
      </p>
    </div>
  );
}
