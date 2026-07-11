import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SNOWBOARD_RULES } from "./default-rules";
import { DEFAULT_SKI_RULES } from "./ski-default-rules";
import type { SkiCalculationRules } from "./ski-types";
import type { SnowboardCalculationRules } from "./types";

// Server-side fetch of the active rulesets (same manifest → payload flow as
// iOS CalculationRulesAPI). Uses a cookie-free client so calculator pages
// stay static/ISR-cacheable; falls back to the bundled defaults.

async function fetchActiveRuleSet(sport: "snowboard" | "ski"): Promise<{
  id: string;
  version: string;
  payload_hash: string;
  payload: unknown;
} | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data: manifest } = await supabase
    .from("calc_rule_manifests")
    .select("active_rule_set_id")
    .eq("sport", sport)
    .limit(1)
    .maybeSingle();
  if (!manifest?.active_rule_set_id) return null;

  const { data: ruleSet } = await supabase
    .from("calc_rule_sets")
    .select("id, version, payload_hash, payload")
    .eq("id", manifest.active_rule_set_id)
    .maybeSingle();
  return ruleSet ?? null;
}

export async function fetchSnowboardRules(): Promise<SnowboardCalculationRules> {
  try {
    const ruleSet = await fetchActiveRuleSet("snowboard");
    const payload = ruleSet?.payload as SnowboardCalculationRules | undefined;
    if (
      !ruleSet ||
      !payload ||
      !Array.isArray(payload.styles) ||
      typeof payload.stanceWidthFromHeightFactor !== "number"
    ) {
      return DEFAULT_SNOWBOARD_RULES;
    }
    return {
      ...payload,
      appliedRuleset: {
        id: String(ruleSet.id),
        version: ruleSet.version,
        hash: ruleSet.payload_hash,
      },
    };
  } catch {
    return DEFAULT_SNOWBOARD_RULES;
  }
}

export async function fetchSkiRules(): Promise<SkiCalculationRules> {
  try {
    const ruleSet = await fetchActiveRuleSet("ski");
    const payload = ruleSet?.payload as SkiCalculationRules | undefined;
    if (
      !ruleSet ||
      !payload ||
      !Array.isArray(payload.terrainOptions) ||
      typeof payload.skiLengthBaseFactor !== "number" ||
      !payload.dinLookupTable
    ) {
      return DEFAULT_SKI_RULES;
    }
    return {
      ...payload,
      appliedRuleset: {
        id: String(ruleSet.id),
        version: ruleSet.version,
        hash: ruleSet.payload_hash,
      },
    };
  } catch {
    return DEFAULT_SKI_RULES;
  }
}
