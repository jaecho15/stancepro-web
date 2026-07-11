"use client";

import { useState } from "react";
import type { SkiCalculationRules } from "@/lib/stance/ski-types";
import type { SnowboardCalculationRules } from "@/lib/stance/types";
import { SkiCalculatorClient } from "./SkiCalculatorClient";
import { StanceCalculatorClient } from "./StanceCalculatorClient";

// Sport switcher for /calculator. Both calculators stay mounted so switching
// tabs doesn't reset the user's inputs.
export function CalculatorTabs({
  snowboardRules,
  skiRules,
}: {
  snowboardRules: SnowboardCalculationRules;
  skiRules: SkiCalculationRules;
}) {
  const [sport, setSport] = useState<"snowboard" | "ski">("snowboard");

  return (
    <div>
      <div className="flex justify-center mb-8">
        <div className="flex rounded-2xl bg-slate-800/60 p-1.5 gap-1.5">
          {(
            [
              ["snowboard", "🏂 Snowboard"],
              ["ski", "⛷️ Ski"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSport(key)}
              className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                sport === key
                  ? "bg-brand-500 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={sport === "snowboard" ? "" : "hidden"}>
        <StanceCalculatorClient rules={snowboardRules} />
      </div>
      <div className={sport === "ski" ? "" : "hidden"}>
        <SkiCalculatorClient rules={skiRules} />
      </div>
    </div>
  );
}
