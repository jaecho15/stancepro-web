"use client";

// App-wide measurement-unit preference: metric / imperial / automatic (follow
// the browser region — US = imperial; parity with the iOS/Android apps'
// UnitSystemPreference/UnitManager). Data stays metric end to end — conversion
// happens only at display time through UnitFormat. Metric mode is a strict
// identity, so adopting these helpers cannot alter existing metric rendering.

import { useEffect, useState } from "react";

export type UnitSystemPref = "automatic" | "metric" | "imperial";

const STORAGE_KEY = "unit_system";
const CHANGE_EVENT = "stancepro:units-changed";

export function getUnitPref(): UnitSystemPref {
  if (typeof window === "undefined") return "automatic";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "metric" || raw === "imperial" ? raw : "automatic";
}

export function setUnitPref(pref: UnitSystemPref): void {
  window.localStorage.setItem(STORAGE_KEY, pref);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function prefIsImperial(pref: UnitSystemPref): boolean {
  if (pref === "metric") return false;
  if (pref === "imperial") return true;
  if (typeof navigator === "undefined") return false;
  const lang = navigator.language ?? "";
  return /[-_]US$/i.test(lang);
}

export class UnitFormat {
  constructor(readonly imperial: boolean) {}

  // Converted values (metric = passthrough)
  snow(cm: number): number { return this.imperial ? cm / 2.54 : cm; }
  snowInt(cm: number): number { return Math.round(this.snow(cm)); }
  rain(mm: number): number { return this.imperial ? mm / 25.4 : mm; }
  temp(celsius: number): number { return this.imperial ? (celsius * 9) / 5 + 32 : celsius; }
  tempInt(celsius: number): number { return Math.round(this.temp(celsius)); }
  elevation(m: number): number { return this.imperial ? Math.round(m * 3.28084) : Math.round(m); }
  distance(km: number): number { return this.imperial ? km / 1.609344 : km; }
  /** Chart-internal snow-label multiplier (geometry is ratio-based). */
  get snowScale(): number { return this.imperial ? 1 / 2.54 : 1; }

  /** Wind, everywhere: km/h (metric) ↔ mph (imperial), from the km/h payload.
   *  Single helper on purpose — the grid used to render m/s through a second
   *  windFromKmh(); two near-identical wind converters only invited drift. */
  windKmh(kmh: number): number { return Math.round(this.imperial ? kmh / 1.609344 : kmh); }

  // Unit labels
  get snowUnit(): string { return this.imperial ? "in" : "cm"; }
  get rainUnit(): string { return this.imperial ? "in" : "mm"; }
  get elevationUnit(): string { return this.imperial ? "ft" : "m"; }
  get windKmhUnit(): string { return this.imperial ? "mph" : "km/h"; }

  elevationLabel(m: number): string { return `${this.elevation(m)} ${this.elevationUnit}`; }

  /** Imperial only: swap metric unit tokens in already-formatted strings
   *  (numeric args must be converted BEFORE formatting). "0°C" → "32°F" first
   *  so freezing-level wording stays physically correct. Only for strings that
   *  carry measurement units — not safe for arbitrary prose. */
  swapUnitTokens(s: string): string {
    if (!this.imperial) return s;
    let out = s;
    for (const [from, to] of [
      ["0 °C", "32 °F"], ["0°C", "32°F"], ["°C", "°F"],
      ["km/h", "mph"], ["m/s", "mph"], ["cm", "in"], ["mm", "in"],
    ] as const) {
      out = out.split(from).join(to);
    }
    out = out.replace(/(?<=\d) ?km\b/g, " mi");
    out = out.replace(/(?<=\d) ?m\b/g, " ft");
    return out;
  }
}

/** Observable hook — first render is SSR-safe (metric-leaning default), then
 *  corrects on mount and re-renders on preference changes from any component
 *  or another tab. */
export function useUnitFormat(): UnitFormat {
  const [imperial, setImperial] = useState(false);
  useEffect(() => {
    const update = () => setImperial(prefIsImperial(getUnitPref()));
    update();
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return new UnitFormat(imperial);
}

/** Current preference as state (for the toggle UI). */
export function useUnitPref(): [UnitSystemPref, (p: UnitSystemPref) => void] {
  const [pref, setPref] = useState<UnitSystemPref>("automatic");
  useEffect(() => {
    const update = () => setPref(getUnitPref());
    update();
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return [pref, setUnitPref];
}
