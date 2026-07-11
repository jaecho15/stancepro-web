"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  GearSetupCardData,
  SkiSetupRow,
  SnowboardSetupRow,
} from "@/lib/profile/fetch";
import { GearSetupCard, SkiSetupCard, SnowboardSetupCard } from "./SetupCards";

// Sport toggle for /profile (same pattern as the calculator tabs): both
// sports stay mounted so switching is instant and scroll state is kept.

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="text-lg font-semibold text-slate-200 mt-8 mb-4">
      {title} <span className="text-slate-500 font-medium text-base">({count})</span>
    </h3>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

export function ProfileSportTabs({
  snowboardSetups,
  skiSetups,
  snowboardGear,
  skiGear,
  fallbackHeightCm,
}: {
  snowboardSetups: SnowboardSetupRow[];
  skiSetups: SkiSetupRow[];
  snowboardGear: GearSetupCardData[];
  skiGear: GearSetupCardData[];
  fallbackHeightCm: number | null;
}) {
  const [sport, setSport] = useState<"snowboard" | "ski">("snowboard");

  return (
    <div className="mt-12">
      <div className="flex justify-center mb-2">
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
        <SectionHeading title="Stance setups" count={snowboardSetups.length} />
        {snowboardSetups.length === 0 ? (
          <EmptyNote>
            Nothing saved yet — setups you save in the app show up here. Try the{" "}
            <Link href="/calculator" className="text-brand-400 hover:text-brand-300">
              web calculator
            </Link>{" "}
            in the meantime.
          </EmptyNote>
        ) : (
          <div className="grid lg:grid-cols-2 gap-5">
            {snowboardSetups.map((setup) => (
              <SnowboardSetupCard
                key={setup.id}
                setup={setup}
                fallbackHeightCm={fallbackHeightCm}
              />
            ))}
          </div>
        )}

        <SectionHeading title="Gear" count={snowboardGear.length} />
        {snowboardGear.length === 0 ? (
          <EmptyNote>
            No snowboard gear saved yet — add your board, boots and bindings in the app&apos;s
            gear section.
          </EmptyNote>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {snowboardGear.map((gear) => (
              <GearSetupCard key={gear.id} gear={gear} />
            ))}
          </div>
        )}
      </div>

      <div className={sport === "ski" ? "" : "hidden"}>
        <SectionHeading title="Setups" count={skiSetups.length} />
        {skiSetups.length === 0 ? (
          <EmptyNote>No ski setups saved in the app yet.</EmptyNote>
        ) : (
          <div className="grid lg:grid-cols-2 gap-5">
            {skiSetups.map((setup) => (
              <SkiSetupCard key={setup.id} setup={setup} />
            ))}
          </div>
        )}

        <SectionHeading title="Gear" count={skiGear.length} />
        {skiGear.length === 0 ? (
          <EmptyNote>
            No ski gear saved yet — add your skis, boots and bindings in the app&apos;s gear
            section.
          </EmptyNote>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {skiGear.map((gear) => (
              <GearSetupCard key={gear.id} gear={gear} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
