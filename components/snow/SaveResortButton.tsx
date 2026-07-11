"use client";

import { Star } from "lucide-react";
import { useMyResorts, type MyResort } from "./useMyResorts";

export function SaveResortButton({ resort }: { resort: MyResort }) {
  const { ready, toggle, isSaved } = useMyResorts();
  if (!ready) return null;
  const saved = isSaved(resort.id);
  return (
    <button
      type="button"
      onClick={() => toggle(resort)}
      aria-pressed={saved}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
        saved
          ? "border-amber-400/60 bg-amber-500/15 text-amber-300"
          : "border-slate-600 text-slate-300 hover:border-slate-400"
      }`}
    >
      <Star className={`w-3.5 h-3.5 ${saved ? "fill-amber-300" : ""}`} />
      {saved ? "Saved" : "Save resort"}
    </button>
  );
}
