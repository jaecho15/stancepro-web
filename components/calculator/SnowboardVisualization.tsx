"use client";

/* eslint-disable @next/next/no-img-element */

// Web port of the app's SnowboardVisualization.swift: top-down board image
// per riding style with real binding images positioned at the computed stance
// width (1.92 pt/cm), style setback, binding rotation (180 − angle) + 180,
// and goofy mirroring. Geometry constants match the SwiftUI original 1:1.

const CM_TO_PX = 1.92;
// Everything shares one scale (1.92 px/cm): the board is drawn at the
// recommended board length, the stance markers at the computed width, and the
// binding at a realistic ~25cm (PNG is 1004/1024 opaque vertically).
const BINDING_SIZE = Math.round(25 * CM_TO_PX * (1024 / 1004));

// aspect = natural PNG height/width, so length in cm fixes the drawn height.
function boardImage(style: string | null): { src: string; aspect: number } {
  switch (style) {
    case "Ground-Tricks":
    case "Park":
      return { src: "/calc/board_twin.png", aspect: 296 / 1454 };
    case "Freeride":
      return { src: "/calc/board_directional.png", aspect: 485 / 2245 };
    case "Carving":
      return { src: "/calc/board_carving.png", aspect: 208 / 1024 };
    case "Powder":
      return { src: "/calc/board_powder.png", aspect: 492 / 2245 };
    case "All-Mountain":
      return { src: "/calc/board_directional_twin.png", aspect: 295 / 1536 };
    default:
      return { src: "/calc/board_twin.png", aspect: 296 / 1454 };
  }
}

function setbackCm(style: string | null): number {
  if (style === "Powder") return 10;
  if (style === "Freeride" || style === "Carving") return 5;
  if (style === "All-Mountain") return 2.5;
  return 0;
}

function parseAngle(angle: string, fallback: number): number {
  const v = parseFloat(angle.replace("°", "").replace("+", "").trim());
  return Number.isFinite(v) ? v : fallback;
}

// Absolutely-positioned child centered on the container, offset like SwiftUI .offset().
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

export function SnowboardVisualization({
  widthCm,
  boardLengthCm,
  frontAngle,
  rearAngle,
  ridingStyle,
  isGoofy,
}: {
  widthCm: number;
  boardLengthCm: number;
  frontAngle: string;
  rearAngle: string;
  ridingStyle: string | null;
  isGoofy: boolean;
}) {
  const board = boardImage(ridingStyle);
  const boardW = boardLengthCm * CM_TO_PX;
  const boardH = boardW * board.aspect;
  const setbackOffset = setbackCm(ridingStyle) * CM_TO_PX;
  const frontDeg = (180 - parseAngle(frontAngle, 15)) + 180;
  const rearDeg = (180 - parseAngle(rearAngle, -6)) + 180;
  const mirror = (x: number) => (isGoofy ? -x : x);

  const frontX = mirror(-(widthCm / 2) * CM_TO_PX + setbackOffset);
  const rearX = mirror((widthCm / 2) * CM_TO_PX + setbackOffset);
  const stanceCenterX = mirror(setbackOffset);

  return (
    <div className="relative w-[340px] h-[240px] mx-auto rounded-[20px] bg-slate-800/50 max-[380px]:scale-90 select-none">
      {/* Board, drawn at the recommended length on the shared cm scale */}
      <At x={0} y={0}>
        <img
          src={board.src}
          alt={`${ridingStyle ?? "Snowboard"} board`}
          width={Math.round(boardW)}
          height={Math.round(boardH)}
          className="drop-shadow-lg"
          style={{
            width: boardW,
            height: boardH,
            objectFit: "contain",
            transform: isGoofy ? "scaleX(-1)" : undefined,
          }}
        />
      </At>

      {/* Center line */}
      <At x={0} y={0}>
        <div className="w-px h-[80px] bg-slate-400/30" />
      </At>

      {/* Binding marker lines + stance width */}
      <At x={frontX} y={40}>
        <div className="w-px h-[40px] bg-slate-400/50" />
      </At>
      <At x={rearX} y={40}>
        <div className="w-px h-[40px] bg-slate-400/50" />
      </At>
      <At x={stanceCenterX} y={50}>
        <div className="h-px bg-slate-400/50" style={{ width: widthCm * CM_TO_PX }} />
      </At>
      <At x={frontX} y={60}>
        <div className="w-2 h-px bg-slate-400/50" />
      </At>
      <At x={rearX} y={60}>
        <div className="w-2 h-px bg-slate-400/50" />
      </At>
      <At x={stanceCenterX * 0.75} y={72}>
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {widthCm.toFixed(1)} cm
        </span>
      </At>

      {/* Angle labels beside each binding */}
      <At x={frontX + mirror(-25)} y={-40}>
        <span className="text-xs font-bold text-white bg-slate-900/70 rounded px-1.5 py-0.5">
          {frontAngle}
        </span>
      </At>
      <At x={rearX + mirror(25)} y={-40}>
        <span className="text-xs font-bold text-white bg-slate-900/70 rounded px-1.5 py-0.5">
          {rearAngle}
        </span>
      </At>

      {/* Nose / tail labels, tracking the board tips */}
      <At x={mirror(-boardW * 0.4)} y={72}>
        <span className="text-xs font-bold text-white bg-slate-900/80 rounded px-1.5 py-0.5">
          NOSE
        </span>
      </At>
      <At x={mirror(boardW * 0.4)} y={72}>
        <span className="text-xs font-bold text-white bg-slate-900/80 rounded px-1.5 py-0.5">
          TAIL
        </span>
      </At>

      {/* Bindings */}
      <At x={frontX} y={5}>
        <img
          src="/calc/binding_front.png"
          alt="Front binding"
          width={BINDING_SIZE}
          height={BINDING_SIZE}
          style={{
            width: BINDING_SIZE,
            height: BINDING_SIZE,
            objectFit: "contain",
            transform: `${isGoofy ? "scaleX(-1) " : ""}rotate(${frontDeg}deg)`,
          }}
        />
      </At>
      <At x={rearX} y={5}>
        <img
          src="/calc/binding_rear.png"
          alt="Rear binding"
          width={BINDING_SIZE}
          height={BINDING_SIZE}
          style={{
            width: BINDING_SIZE,
            height: BINDING_SIZE,
            objectFit: "contain",
            transform: `${isGoofy ? "scaleX(-1) " : ""}rotate(${rearDeg}deg)`,
          }}
        />
      </At>
    </div>
  );
}

export { setbackCm };
