"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronDown, Sparkles } from "lucide-react";
import { calculateSkiResult, recommendSkiLength } from "@/lib/stance/ski-engine";
import type { SkiCalculationRules } from "@/lib/stance/ski-types";
import { SkiVisualization } from "./SkiVisualization";

const TERRAIN_DESCRIPTIONS: Record<string, string> = {
  "Piste/Carving": "Groomed runs & clean arcs",
  "All-Mountain": "A bit of everything",
  "Freeride/Powder": "Deep snow & big lines",
  "Freestyle/Park": "Jumps, rails & switch",
  Touring: "Uphill efficiency",
};

const SKILL_ENGINE_KEYS = ["beginner", "intermediate", "advanced"] as const;
const TERRAIN_ENGINE_KEYS = [
  "pisteCarving",
  "allMountain",
  "powderFreeride",
  "parkFreestyle",
  "touring",
] as const;

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

export function SkiCalculatorClient({ rules }: { rules: SkiCalculationRules }) {
  const [heightUnit, setHeightUnit] = useState<"cm" | "in">("cm");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [heightValue, setHeightValue] = useState("175");
  const [weightValue, setWeightValue] = useState("75");
  const [terrainIndex, setTerrainIndex] = useState(1);
  const [skillLevelIndex, setSkillLevelIndex] = useState(1);
  const [showDin, setShowDin] = useState(false);
  const [ageValue, setAgeValue] = useState("");
  const [bslValue, setBslValue] = useState("");
  // 0 = follow skill level, 1..3 = conservative/moderate/aggressive
  const [aggressivenessIndex, setAggressivenessIndex] = useState(0);

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

  const age = useMemo(() => {
    const v = parseInt(ageValue, 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [ageValue]);

  const bootSoleLength = useMemo(() => {
    const v = parseFloat(bslValue);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [bslValue]);

  const result = useMemo(() => {
    if (heightCm === null || weightKg === null) return null;
    return calculateSkiResult(
      {
        height: heightCm,
        weight: weightKg,
        age,
        skillLevelIndex,
        terrainFocusIndex: terrainIndex,
        bootSoleLength,
        dinAggressivenessKey:
          aggressivenessIndex === 0
            ? null
            : rules.dinAggressivenessKeys[aggressivenessIndex - 1] ?? null,
        hasInjury: false,
      },
      rules
    );
  }, [heightCm, weightKg, age, skillLevelIndex, terrainIndex, bootSoleLength, aggressivenessIndex, rules]);

  const envelope = useMemo(() => {
    if (heightCm === null || weightKg === null) return null;
    return recommendSkiLength(
      heightCm,
      weightKg,
      SKILL_ENGINE_KEYS[skillLevelIndex] ?? "intermediate",
      TERRAIN_ENGINE_KEYS[terrainIndex] ?? "pisteCarving",
      rules
    );
  }, [heightCm, weightKg, skillLevelIndex, terrainIndex, rules]);

  const setup = result?.skiSetup;
  const trace = setup?.dinTrace;

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

        <Field label="Terrain focus">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rules.terrainOptions.map((terrain, index) => (
              <button
                key={terrain}
                type="button"
                onClick={() => setTerrainIndex(index)}
                className={`rounded-xl px-3 py-3 text-left transition-all border ${
                  terrainIndex === index
                    ? "border-brand-500 bg-brand-500/15 text-white"
                    : "border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500"
                }`}
              >
                <span className="block text-sm font-semibold">{terrain}</span>
                <span className="block text-xs text-slate-400 mt-0.5">
                  {TERRAIN_DESCRIPTIONS[terrain] ?? ""}
                </span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Skill level">
          <SegmentedControl
            options={rules.skillLevelOptions}
            value={skillLevelIndex}
            onChange={setSkillLevelIndex}
          />
        </Field>

        <div className="border-t border-slate-700/60 pt-4">
          <button
            type="button"
            onClick={() => setShowDin(!showDin)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${showDin ? "rotate-180" : ""}`}
            />
            DIN reference (age & boot sole length)
          </button>
          {showDin && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Age (years)">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 35"
                    value={ageValue}
                    onChange={(e) => setAgeValue(e.target.value)}
                    className="w-full rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
                  />
                </Field>
                <Field label="Boot sole length (mm)">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 305"
                    value={bslValue}
                    onChange={(e) => setBslValue(e.target.value)}
                    className="w-full rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
                  />
                </Field>
              </div>
              <Field label="Skier type (release setting profile)">
                <SegmentedControl
                  options={["skill", ...rules.dinAggressivenessKeys]}
                  labels={["By skill level", "Type I", "Type II", "Type III"]}
                  value={aggressivenessIndex}
                  onChange={setAggressivenessIndex}
                />
              </Field>
              <p className="text-xs text-slate-500">
                Boot sole length is printed on the boot heel (in mm). Type I rides
                cautiously, Type III fast and aggressively.
              </p>
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
        {result && setup && envelope ? (
          <div className="space-y-6">
            <SkiVisualization
              skiLengthCm={setup.skiLengthCm}
              mountOffsetMm={setup.mountOffsetMm}
              terrainFocus={result.selectedTerrain}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-800/50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Ski length</p>
                <p className="text-2xl font-bold text-white">
                  {Math.trunc(setup.skiLengthCm)}{" "}
                  <span className="text-base font-medium">cm</span>
                </p>
                <p className="text-sm text-slate-400">
                  range {envelope.minCm}–{envelope.maxCm} cm
                </p>
              </div>
              <div className="rounded-xl bg-slate-800/50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Mount point</p>
                <p className="text-2xl font-bold text-white">
                  {setup.mountOffsetMm > 0 ? "+" : ""}
                  {setup.mountOffsetMm} <span className="text-base font-medium">mm</span>
                </p>
                <p className="text-sm text-slate-400">
                  {setup.mountOffsetMm === 0
                    ? "factory line"
                    : setup.mountOffsetMm > 0
                      ? "forward of line"
                      : "behind line"}
                </p>
              </div>
            </div>

            {/* DIN reference */}
            <div className="rounded-xl bg-slate-800/50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                DIN reference (ISO 11088)
              </p>
              {setup.dinReferenceRange ? (
                <>
                  <p className="text-2xl font-bold text-white">
                    {setup.dinReferenceRange.min.toFixed(2).replace(/\.?0+$/, "")}–
                    {setup.dinReferenceRange.max.toFixed(2).replace(/\.?0+$/, "")}
                  </p>
                  <p className="text-sm text-slate-400">
                    skier code {trace?.finalCodeLetter} · BSL {trace?.bslBucket} mm
                  </p>
                </>
              ) : trace?.status === "out_of_range" ? (
                <p className="text-sm text-slate-400">{trace.reason}</p>
              ) : (
                <p className="text-sm text-slate-400">
                  Add your age and boot sole length above to see the reference range.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                {setup.notes.dinDisclaimer}
              </p>
            </div>

            <div className="space-y-2 text-sm text-slate-400">
              <p>{setup.notes.skiLengthNote}</p>
              <p>{setup.notes.mountNote}</p>
            </div>

            <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
              <p className="text-sm text-slate-300 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
                Want gear-matched recommendations and AI video coaching?
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
