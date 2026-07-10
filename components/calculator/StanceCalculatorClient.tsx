"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronDown, Ruler, Sparkles } from "lucide-react";
import { calculateResult, recommendBoardShape } from "@/lib/stance/engine";
import type { SnowboardCalculationRules } from "@/lib/stance/types";

const STYLE_DESCRIPTIONS: Record<string, string> = {
  "All-Mountain": "Versatile riding all over the hill",
  "Ground-Tricks": "Butters, presses & flatland tricks",
  Freeride: "Steep, deep & directional",
  Park: "Jumps, rails & features",
  Powder: "Deep snow float",
  Carving: "Aggressive edge-to-edge turns",
};

const NEUTRAL_CARVING = "neutralCarving";
const FORWARD_CARVING = "forwardCarving";

function SegmentedControl({
  options,
  value,
  onChange,
  labels,
}: {
  options: string[];
  value: number;
  onChange: (index: number) => void;
  labels?: string[];
}) {
  return (
    <div className="flex rounded-xl bg-slate-800/60 p-1 gap-1">
      {options.map((option, index) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(index)}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            value === index
              ? "bg-brand-500 text-white shadow"
              : "text-slate-400 hover:text-white"
          }`}
        >
          {labels?.[index] ?? option}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-2">{label}</label>
      {children}
    </div>
  );
}

function parseAngle(angle: string): number {
  return parseInt(angle.replace("°", ""), 10) || 0;
}

function StanceDiagram({
  front,
  rear,
  widthCm,
}: {
  front: string;
  rear: string;
  widthCm: number;
}) {
  const frontDeg = parseAngle(front);
  const rearDeg = parseAngle(rear);
  return (
    <svg viewBox="0 0 360 120" className="w-full max-w-md mx-auto" aria-hidden>
      {/* Board */}
      <rect
        x="10"
        y="35"
        width="340"
        height="50"
        rx="25"
        className="fill-slate-800 stroke-slate-600"
        strokeWidth="1.5"
      />
      {/* Rear binding (rider left, goofy-agnostic diagram) */}
      <g transform={`translate(120 60) rotate(${-rearDeg})`}>
        <rect x="-11" y="-24" width="22" height="48" rx="9" className="fill-brand-500/80" />
      </g>
      {/* Front binding */}
      <g transform={`translate(240 60) rotate(${-frontDeg})`}>
        <rect x="-11" y="-24" width="22" height="48" rx="9" className="fill-brand-400" />
      </g>
      <text x="120" y="20" textAnchor="middle" className="fill-slate-300 text-[13px] font-medium">
        {rear}
      </text>
      <text x="240" y="20" textAnchor="middle" className="fill-slate-300 text-[13px] font-medium">
        {front}
      </text>
      {/* Width marker */}
      <line x1="120" y1="102" x2="240" y2="102" className="stroke-slate-500" strokeWidth="1" />
      <line x1="120" y1="97" x2="120" y2="107" className="stroke-slate-500" strokeWidth="1" />
      <line x1="240" y1="97" x2="240" y2="107" className="stroke-slate-500" strokeWidth="1" />
      <text x="180" y="117" textAnchor="middle" className="fill-slate-400 text-[11px]">
        {widthCm.toFixed(1)} cm
      </text>
    </svg>
  );
}

export function StanceCalculatorClient({ rules }: { rules: SnowboardCalculationRules }) {
  const [heightUnit, setHeightUnit] = useState<"cm" | "in">("cm");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [heightValue, setHeightValue] = useState("175");
  const [weightValue, setWeightValue] = useState("75");
  const [styleIndex, setStyleIndex] = useState(0);
  const [skillLevelIndex, setSkillLevelIndex] = useState(1);
  const [switchIndex, setSwitchIndex] = useState(0);
  const [bodyFlexIndex, setBodyFlexIndex] = useState(1);
  const [coreStrengthIndex, setCoreStrengthIndex] = useState(1);
  const [hasInjury, setHasInjury] = useState(false);
  const [carvingStanceType, setCarvingStanceType] = useState(NEUTRAL_CARVING);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [legLengthValue, setLegLengthValue] = useState("");
  const [bootFlex, setBootFlex] = useState(5);
  const [boardFlex, setBoardFlex] = useState(5);
  const [bindingFlex, setBindingFlex] = useState(5);

  const heightCm = useMemo(() => {
    const v = parseFloat(heightValue);
    if (!Number.isFinite(v) || v <= 0) return null;
    return heightUnit === "cm" ? v : v * 2.54;
  }, [heightValue, heightUnit]);

  const weightKg = useMemo(() => {
    const v = parseFloat(weightValue);
    if (!Number.isFinite(v) || v <= 0) return null;
    return weightUnit === "kg" ? v : v / 2.20462;
  }, [weightValue, weightUnit]);

  const legLengthCm = useMemo(() => {
    const v = parseFloat(legLengthValue);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [legLengthValue]);

  const styleName = rules.styles[styleIndex] ?? "All-Mountain";
  const isCarving = styleName === "Carving";

  const result = useMemo(() => {
    if (heightCm === null || weightKg === null) return null;
    return calculateResult(
      {
        height: heightCm,
        legLength: legLengthCm ?? heightCm * 0.5,
        weight: weightKg,
        styleIndex,
        switchIndex,
        bodyFlexIndex,
        coreStrengthIndex,
        hasInjury,
        useHeightForBase: legLengthCm === null,
        bootFlex,
        boardFlex,
        bindingFlex,
        skillLevelIndex,
        carvingStanceType: isCarving ? carvingStanceType : null,
      },
      rules
    );
  }, [
    heightCm,
    weightKg,
    legLengthCm,
    styleIndex,
    switchIndex,
    bodyFlexIndex,
    coreStrengthIndex,
    hasInjury,
    bootFlex,
    boardFlex,
    bindingFlex,
    skillLevelIndex,
    carvingStanceType,
    isCarving,
    rules,
  ]);

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      {/* Inputs */}
      <div className="glass rounded-2xl p-6 md:p-8 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Height (${heightUnit})`}>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={heightValue}
                onChange={(e) => setHeightValue(e.target.value)}
                className="w-full rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={() => {
                  const next = heightUnit === "cm" ? "in" : "cm";
                  const v = parseFloat(heightValue);
                  if (Number.isFinite(v)) {
                    setHeightValue(
                      (next === "in" ? v / 2.54 : v * 2.54).toFixed(1).replace(/\.0$/, "")
                    );
                  }
                  setHeightUnit(next);
                }}
                className="px-3 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-sm hover:text-white"
              >
                {heightUnit}
              </button>
            </div>
          </Field>
          <Field label={`Weight (${weightUnit})`}>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={weightValue}
                onChange={(e) => setWeightValue(e.target.value)}
                className="w-full rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={() => {
                  const next = weightUnit === "kg" ? "lb" : "kg";
                  const v = parseFloat(weightValue);
                  if (Number.isFinite(v)) {
                    setWeightValue(
                      (next === "lb" ? v * 2.20462 : v / 2.20462).toFixed(1).replace(/\.0$/, "")
                    );
                  }
                  setWeightUnit(next);
                }}
                className="px-3 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-sm hover:text-white"
              >
                {weightUnit}
              </button>
            </div>
          </Field>
        </div>

        <Field label="Riding style">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rules.styles.map((style, index) => (
              <button
                key={style}
                type="button"
                onClick={() => setStyleIndex(index)}
                className={`rounded-xl px-3 py-3 text-left transition-all border ${
                  styleIndex === index
                    ? "border-brand-500 bg-brand-500/15 text-white"
                    : "border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500"
                }`}
              >
                <span className="block text-sm font-semibold">{style}</span>
                <span className="block text-xs text-slate-400 mt-0.5">
                  {STYLE_DESCRIPTIONS[style] ?? ""}
                </span>
              </button>
            ))}
          </div>
        </Field>

        {isCarving && (
          <Field label="Carving stance">
            <SegmentedControl
              options={[NEUTRAL_CARVING, FORWARD_CARVING]}
              labels={["Neutral", "Forward (posi-posi)"]}
              value={carvingStanceType === NEUTRAL_CARVING ? 0 : 1}
              onChange={(i) => setCarvingStanceType(i === 0 ? NEUTRAL_CARVING : FORWARD_CARVING)}
            />
          </Field>
        )}

        <Field label="Skill level">
          <SegmentedControl
            options={rules.skillLevelOptions}
            value={skillLevelIndex}
            onChange={setSkillLevelIndex}
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Do you ride switch?">
            <SegmentedControl
              options={rules.switchOptions}
              value={switchIndex}
              onChange={setSwitchIndex}
            />
          </Field>
          <Field label="Body flexibility">
            <SegmentedControl
              options={rules.flexibilityOptions}
              value={bodyFlexIndex}
              onChange={setBodyFlexIndex}
            />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Core strength">
            <SegmentedControl
              options={rules.coreStrengthOptions}
              value={coreStrengthIndex}
              onChange={setCoreStrengthIndex}
            />
          </Field>
          <Field label="Knee concerns / past injury">
            <SegmentedControl
              options={["No", "Yes"]}
              value={hasInjury ? 1 : 0}
              onChange={(i) => setHasInjury(i === 1)}
            />
          </Field>
        </div>

        <div className="border-t border-slate-700/60 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
            Fine-tuning (gear flex & leg length)
          </button>
          {showAdvanced && (
            <div className="mt-4 space-y-4">
              <Field label="Leg length / crotch height in cm (leave blank to estimate from height)">
                <div className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-slate-500" />
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder={heightCm ? (heightCm * 0.5).toFixed(1) : ""}
                    value={legLengthValue}
                    onChange={(e) => setLegLengthValue(e.target.value)}
                    className="w-full rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </Field>
              {(
                [
                  ["Boot flex", bootFlex, setBootFlex],
                  ["Board flex", boardFlex, setBoardFlex],
                  ["Binding flex", bindingFlex, setBindingFlex],
                ] as const
              ).map(([label, value, setter]) => (
                <Field key={label} label={`${label}: ${value} / 10`}>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.5}
                    value={value}
                    onChange={(e) => setter(parseFloat(e.target.value))}
                    className="w-full accent-brand-500"
                  />
                </Field>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <motion.div
        className="glass rounded-2xl p-6 md:p-8 lg:sticky lg:top-24"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {result ? (
          <div className="space-y-6">
            <StanceDiagram
              front={result.frontAngle}
              rear={result.rearAngle}
              widthCm={result.width}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-800/50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Stance width</p>
                <p className="text-2xl font-bold text-white">
                  {result.width.toFixed(1)} <span className="text-base font-medium">cm</span>
                </p>
                <p className="text-sm text-slate-400">{(result.width / 2.54).toFixed(1)} in</p>
              </div>
              <div className="rounded-xl bg-slate-800/50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                  Binding angles
                </p>
                <p className="text-2xl font-bold text-white">
                  {result.frontAngle} <span className="text-slate-500">/</span> {result.rearAngle}
                </p>
                <p className="text-sm text-slate-400">front / rear</p>
              </div>
              <div className="rounded-xl bg-slate-800/50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Board length</p>
                <p className="text-2xl font-bold text-white">
                  {result.boardLength} <span className="text-base font-medium">cm</span>
                </p>
                <p className="text-sm text-slate-400">±3 cm by preference</p>
              </div>
              <div className="rounded-xl bg-slate-800/50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Highback lean</p>
                <p className="text-2xl font-bold text-white">{result.highbackLean}</p>
                <p className="text-sm text-slate-400">forward lean</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-800/50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                Recommended board shape
              </p>
              <p className="text-lg font-semibold text-white">
                {recommendShapeLabel(result.method, switchIndex)}
              </p>
            </div>

            <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
              <p className="text-sm text-slate-300 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
                Want gear-matched recommendations, pro-rider comparisons and AI video coaching?
              </p>
              <Link
                href="/download"
                className="inline-block mt-3 px-4 py-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-medium hover:from-brand-400 hover:to-brand-500 transition-all"
              >
                Get the StancePro app
              </Link>
            </div>

            <p className="text-xs text-slate-600">
              Engine ruleset: {result.appliedRuleset.version} — identical to the StancePro app.
            </p>
          </div>
        ) : (
          <p className="text-slate-400">Enter your height and weight to see your setup.</p>
        )}
      </motion.div>
    </div>
  );
}

function recommendShapeLabel(styleName: string, switchIndex: number): string {
  const styles = ["All-Mountain", "Ground-Tricks", "Freeride", "Park", "Powder", "Carving"];
  const styleIndex = styles.indexOf(styleName);
  return recommendBoardShape(styleIndex === -1 ? 0 : styleIndex, switchIndex, 0);
}
