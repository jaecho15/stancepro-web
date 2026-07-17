"use client";

import { useEffect, useState, type ReactNode } from "react";

// Tab shell for the unified resort page. Content arrives as server-rendered
// slots (so the seasonal card keeps its server-only geometry imports); the
// 3D viewer iframe mounts lazily on first visit to its tab and stays mounted
// after that. Deep-linkable via #forecast / #season / #map3d / #info.

const TABS = [
  { id: "forecast", label: "Forecast" },
  { id: "season", label: "Season" },
  { id: "map3d", label: "3D map" },
  { id: "info", label: "Info" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ResortTabs({
  terrainId,
  resortName,
  forecast,
  season,
  info,
}: {
  // OSM/manual weather id for the 3D viewer (terrain artifacts are keyed by it,
  // not the curated slug). Resolved by the page via terrainResortId().
  terrainId: string;
  resortName: string;
  forecast: ReactNode;
  season: ReactNode;
  info: ReactNode;
}) {
  const [active, setActive] = useState<TabId>("forecast");
  const [mounted3d, setMounted3d] = useState(false);

  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "") as TabId;
    if (TABS.some((tab) => tab.id === fromHash)) {
      setActive(fromHash);
      if (fromHash === "map3d") setMounted3d(true);
    }
  }, []);

  const select = (id: TabId) => {
    setActive(id);
    if (id === "map3d") setMounted3d(true);
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div>
      <div className="flex rounded-xl bg-slate-800/60 p-1 gap-1 max-w-md mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => select(tab.id)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              active === tab.id
                ? "bg-brand-500 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={active === "forecast" ? "" : "hidden"}>{forecast}</div>
      <div className={active === "season" ? "" : "hidden"}>{season}</div>
      <div className={active === "map3d" ? "" : "hidden"}>
        {mounted3d && (
          <div className="glass rounded-2xl overflow-hidden">
            <iframe
              src={`/resort-3d/${terrainId}/view?name=${encodeURIComponent(resortName)}`}
              title={`${resortName} 3D terrain`}
              className="w-full h-[70vh] min-h-[420px] block border-0"
              allow="fullscreen"
            />
          </div>
        )}
      </div>
      <div className={active === "info" ? "" : "hidden"}>{info}</div>
    </div>
  );
}
