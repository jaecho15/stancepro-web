"use client";

/* eslint-disable @next/next/no-img-element */

import { ArrowDown, ArrowUp } from "lucide-react";

// Web port of the app's SkiVisualization.swift: vertical pair of terrain-
// specific ski images with the binding pair shifted by the mount offset
// (mm/10 × 1.76 pt/cm), a fixed-height length guide with the recommended
// length, and TIP/TAIL labels. Geometry constants match the SwiftUI original.

const CM_TO_PX = 1.76;
const VIS_SCALE = 0.94;
const GUIDE_HEIGHT = 324;
const BINDING_TAIL_ADJUSTMENT = 8;

function skiImage(terrain: string | null): string {
  switch (terrain) {
    case "Piste/Carving":
    case "Piste":
      return "/calc/ski_piste_carving.png";
    case "Freeride/Powder":
    case "Powder":
      return "/calc/ski_freeride_powder.png";
    case "Freestyle/Park":
    case "Freestyle":
      return "/calc/ski_freestyle_park.png";
    case "Touring":
      return "/calc/ski_touring.png";
    case "Backcountry":
      return "/calc/ski_backcountry.png";
    default:
      return "/calc/ski_all_mountain.png";
  }
}

function At({
  x,
  y,
  children,
  className = "",
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`absolute left-1/2 top-1/2 ${className}`}
      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
    >
      {children}
    </div>
  );
}

function EndLabel({ text }: { text: string }) {
  return (
    <span className="text-[10px] font-bold text-slate-400 bg-slate-900/85 rounded-full px-1.5 py-px">
      {text}
    </span>
  );
}

export function SkiVisualization({
  skiLengthCm,
  mountOffsetMm,
  terrainFocus,
}: {
  skiLengthCm: number;
  mountOffsetMm: number;
  terrainFocus: string | null;
}) {
  const img = skiImage(terrainFocus);
  const mountOffsetPx = (mountOffsetMm / 10) * CM_TO_PX;
  const bindingY = mountOffsetPx * 0.5 + BINDING_TAIL_ADJUSTMENT;
  const offsetLabel = `${mountOffsetMm > 0 ? "+" : ""}${mountOffsetMm} mm`;

  return (
    <div className="flex items-start gap-3">
      {/* Ski pair graphic */}
      <div className="relative w-[140px] h-[340px] shrink-0 rounded-xl bg-slate-800/50 overflow-hidden select-none">
        {[-16, 16].map((dx) => (
          <At key={`ski-${dx}`} x={dx * VIS_SCALE} y={0}>
            <img
              src={img}
              alt={`${terrainFocus ?? "All-Mountain"} ski`}
              className="opacity-95"
              style={{ maxWidth: "none", height: 330 * VIS_SCALE, width: "auto", objectFit: "contain" }}
            />
          </At>
        ))}

        {/* Length guide */}
        <At x={-46} y={0}>
          <div className="relative flex flex-col items-center">
            <div className="w-3 h-0.5 bg-sky-400/95" />
            <div className="w-0.5 bg-sky-400/95" style={{ height: GUIDE_HEIGHT - 4 }} />
            <div className="w-3 h-0.5 bg-sky-400/95" />
            <span
              className="absolute top-1/2 left-1/2 text-[9px] font-bold text-sky-300 bg-black/45 rounded px-1.5 py-0.5 whitespace-nowrap"
              style={{ transform: "translate(-50%, -50%) translateX(-16px) rotate(-90deg)" }}
            >
              {Math.trunc(skiLengthCm)} cm
            </span>
          </div>
        </At>

        {/* Binding pair (both skis) */}
        {[-16, 16].map((dx) => (
          <At key={`binding-${dx}`} x={dx * VIS_SCALE} y={bindingY}>
            <img
              src="/calc/ski_binding.png"
              alt="Ski binding"
              className="drop-shadow"
              style={{
                maxWidth: "none",
                width: 50.4 * VIS_SCALE,
                height: 93.6 * VIS_SCALE,
                objectFit: "contain",
                filter: "grayscale(1) brightness(1.4)",
              }}
            />
          </At>
        ))}

        {/* Mount offset label */}
        <At x={0} y={mountOffsetPx * 0.5 + 50}>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <div className="w-4 h-0.5 bg-sky-400/95" />
            <span className="text-[9px] font-bold text-sky-300 bg-black/35 rounded px-1 py-px">
              Setback {offsetLabel}
            </span>
            <div className="w-4 h-0.5 bg-sky-400/95" />
          </div>
        </At>

        {/* Tip / tail labels */}
        <At x={42} y={-152}>
          <EndLabel text="TIP" />
        </At>
        <At x={42} y={152}>
          <EndLabel text="TAIL" />
        </At>
      </div>

      {/* Setup info */}
      <div className="flex-1 py-3 space-y-3 min-w-0">
        <div>
          <p className="text-[11px] font-medium text-slate-500">Ski Length</p>
          <p className="text-2xl font-bold text-white">{Math.trunc(skiLengthCm)} cm</p>
        </div>
        <div className="border-t border-slate-700/60" />
        <div>
          <p className="text-[11px] font-medium text-slate-500">Mount Offset</p>
          <p className="text-2xl font-bold text-white flex items-center gap-1.5">
            {mountOffsetMm !== 0 &&
              (mountOffsetMm > 0 ? (
                <ArrowUp className="w-4 h-4 text-orange-400" />
              ) : (
                <ArrowDown className="w-4 h-4 text-orange-400" />
              ))}
            {offsetLabel}
          </p>
          <p className="text-[10px] text-slate-500">
            {mountOffsetMm === 0 ? "Factory mark" : mountOffsetMm > 0 ? "Forward" : "Back"}
          </p>
        </div>
        <div className="border-t border-slate-700/60" />
        <div>
          <p className="text-[11px] font-medium text-slate-500">Terrain</p>
          <p className="text-lg font-bold text-white">{terrainFocus ?? "All-Mountain"}</p>
        </div>
      </div>
    </div>
  );
}
