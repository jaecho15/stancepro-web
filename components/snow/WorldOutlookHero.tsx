import {
  regionHighlightRect,
  regionZonePaths,
  WORLD_PATHS,
  WORLD_VIEWBOX,
} from "@/lib/snow/region-context";
import { isSeasonStatus, statusLean } from "@/lib/snow/season-status";
import type { SeasonalOutlookRow } from "@/lib/snow/types";

// World hero map for /snow-outlook: baked Natural Earth silhouette with every
// served region drawn as its real subregion polygons (lean-coloured) plus a
// numbered pin. Server-rendered SVG; OutlookHeroSync wires hover/click sync
// with the cards below. Regions added to the serving table appear here
// automatically — nothing is hardcoded per region except pin nudges.

const LEAN_COLOR: Record<string, string> = {
  above: "#378ADD",
  below: "#EF9F27",
  near: "#94a3b8",
};

const PIN_TEXT: Record<string, string> = {
  above: "#042C53",
  below: "#412402",
  near: "#0d1526",
};

// Label-circle offsets (dx, dy from the zone centre) for crowded clusters —
// Japan and western North America overlap at world scale. Unlisted regions
// (e.g. future southern-hemisphere rows) default to the zone centre.
const PIN_NUDGE: Record<string, [number, number]> = {
  Hokkaido: [8, -8],
  Honshu: [14, 4],
  NA_pacific_nw: [-12, -6],
  NA_northern_rockies: [4, -11],
  Sierra: [-8, 5],
  // Andes/Patagonia share one longitude band — fan the pins out.
  cl_central_andes: [-11, -3],
  ar_mendoza: [10, -5],
  cl_southern_andes: [-11, 6],
  ar_northern_patagonia: [10, 5],
  ar_southern_patagonia: [1, 13],
  // NZ sits at the antimeridian edge — pull pins inward.
  nz_north_island: [-2, -8],
  nz_south_island: [-11, 6],
};

export function WorldOutlookHero({ rows }: { rows: SeasonalOutlookRow[] }) {
  const zones = rows.map((row, i) => {
    const lean =
      row.payload.signal?.lean ??
      (isSeasonStatus(row) ? statusLean(row.payload.status!) : "near");
    const rect = regionHighlightRect(row.region_ids);
    const cx = rect ? rect.x + rect.w / 2 : null;
    const cy = rect ? rect.y + rect.h / 2 : null;
    const [dx, dy] = PIN_NUDGE[row.climate_region] ?? [0, 0];
    return {
      id: row.climate_region,
      n: i + 1,
      lean,
      color: LEAN_COLOR[lean],
      textColor: PIN_TEXT[lean],
      paths: regionZonePaths(row.region_ids),
      cx,
      cy,
      px: cx !== null ? cx + dx : null,
      py: cy !== null ? cy + dy : null,
      nudged: dx !== 0 || dy !== 0,
    };
  });

  return (
    <div>
      <svg
        viewBox={WORLD_VIEWBOX}
        className="w-full block rounded-2xl bg-slate-900/70 border border-slate-700/50"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="World map highlighting the climate regions covered by the seasonal outlook"
      >
        <g className="fill-slate-700/70">
          {WORLD_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {zones.map((zone) => (
          <g key={zone.id} data-zone={zone.id}>
            {zone.paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={zone.color}
                fillOpacity="0.28"
                stroke={zone.color}
                strokeWidth="0.6"
                strokeLinejoin="round"
              />
            ))}
          </g>
        ))}
        {zones.map(
          (zone) =>
            zone.px !== null &&
            zone.py !== null && (
              <g key={`pin-${zone.id}`} data-pin={zone.id} className="cursor-pointer">
                {zone.nudged && (
                  <line
                    x1={zone.cx!}
                    y1={zone.cy!}
                    x2={zone.px}
                    y2={zone.py}
                    stroke={zone.color}
                    strokeWidth="0.5"
                  />
                )}
                <circle cx={zone.px} cy={zone.py} r="4.6" fill={zone.color} />
                <text
                  x={zone.px}
                  y={zone.py + 2.3}
                  textAnchor="middle"
                  fontSize="6.5"
                  fontWeight="600"
                  fill={zone.textColor}
                >
                  {zone.n}
                </text>
              </g>
            )
        )}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 px-1 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: LEAN_COLOR.above }} />
          Leaning above normal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: LEAN_COLOR.below }} />
          Leaning below normal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: LEAN_COLOR.near }} />
          Trend only
        </span>
        <span className="text-slate-600">
          Hover a card to locate it — tap a pin to jump to its card
        </span>
      </div>
    </div>
  );
}
