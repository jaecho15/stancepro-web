import { Star } from "lucide-react";
import type { GearSetupCardData, SkiSetupRow, SnowboardSetupRow } from "@/lib/profile/fetch";
import { SnowboardVisualization } from "@/components/calculator/SnowboardVisualization";
import { SkiVisualization } from "@/components/calculator/SkiVisualization";

/* eslint-disable @next/next/no-img-element */

function BaseBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-medium px-2 py-0.5">
      <Star className="w-3 h-3" /> Base setup
    </span>
  );
}

function CardHeader({ name, isBase, meta }: { name: string; isBase: boolean; meta: string }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <p className="text-lg font-semibold text-white truncate">{name}</p>
        <p className="text-xs text-slate-500 mt-0.5">{meta}</p>
      </div>
      {isBase && <BaseBadge />}
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function SnowboardSetupCard({
  setup,
  fallbackHeightCm,
}: {
  setup: SnowboardSetupRow;
  fallbackHeightCm: number | null;
}) {
  const style = setup.riding_style ?? setup.method;
  return (
    <div className="glass rounded-2xl p-5">
      <CardHeader
        name={setup.name ?? "Snowboard setup"}
        isBase={Boolean(setup.is_base_setup)}
        meta={[style, setup.skill_level, fmtDate(setup.created_at)].filter(Boolean).join(" · ")}
      />
      <SnowboardVisualization
        widthCm={setup.width}
        boardLengthCm={setup.board_length}
        riderHeightCm={setup.height ?? fallbackHeightCm ?? 175}
        frontAngle={setup.front_angle}
        rearAngle={setup.rear_angle}
        ridingStyle={style}
        isGoofy={Boolean(setup.goofy)}
      />
      <div className="grid grid-cols-4 gap-2 mt-4 text-center">
        {(
          [
            ["Width", `${setup.width.toFixed(1)} cm`],
            ["Angles", `${setup.front_angle} / ${setup.rear_angle}`],
            ["Board", `${setup.board_length} cm`],
            ["Highback", setup.highback_lean ?? "—"],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-800/50 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
            <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkiSetupCard({ setup }: { setup: SkiSetupRow }) {
  const hasDin = setup.din_reference_min !== null && setup.din_reference_max !== null;
  return (
    <div className="glass rounded-2xl p-5">
      <CardHeader
        name={setup.name ?? "Ski setup"}
        isBase={Boolean(setup.is_base_setup)}
        meta={[setup.terrain_focus, setup.skill_level, fmtDate(setup.created_at)]
          .filter(Boolean)
          .join(" · ")}
      />
      <SkiVisualization
        skiLengthCm={setup.ski_length_cm}
        mountOffsetMm={setup.mount_offset_mm}
        terrainFocus={setup.terrain_focus}
      />
      <div className="rounded-lg bg-slate-800/50 px-3 py-2 mt-4 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          DIN reference (ISO 11088)
        </span>
        <span className="text-sm font-semibold text-white">
          {hasDin
            ? `${setup.din_reference_min}–${setup.din_reference_max}`
            : "not calculated"}
        </span>
      </div>
    </div>
  );
}

export function GearSetupCard({ gear }: { gear: GearSetupCardData }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-lg font-semibold text-white truncate">{gear.title ?? "Gear setup"}</p>
        {gear.isBase && <BaseBadge />}
      </div>
      <div className="space-y-2">
        {gear.items.map((item) => (
          <div
            key={item.kind}
            className="flex items-center gap-3 rounded-xl bg-slate-800/50 px-3 py-2.5"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.label ?? item.kind}
                className="w-10 h-10 rounded-lg object-contain bg-white/90 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-slate-700/60 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{item.kind}</p>
              <p className="text-sm font-medium text-white truncate">
                {item.label ?? "Not set"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
