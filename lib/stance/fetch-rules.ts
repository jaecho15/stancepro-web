import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SNOWBOARD_RULES } from "./default-rules";
import type { SnowboardCalculationRules } from "./types";

// Server-side fetch of the active snowboard ruleset (same manifest → payload
// flow as iOS CalculationRulesAPI). Uses a cookie-free client so calculator
// pages stay static/ISR-cacheable; falls back to the bundled defaults.
export async function fetchSnowboardRules(): Promise<SnowboardCalculationRules> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return DEFAULT_SNOWBOARD_RULES;
  }

  try {
    const supabase = createClient(url, key);
    const { data: manifest } = await supabase
      .from("calc_rule_manifests")
      .select("active_rule_set_id")
      .eq("sport", "snowboard")
      .limit(1)
      .maybeSingle();

    if (!manifest?.active_rule_set_id) {
      return DEFAULT_SNOWBOARD_RULES;
    }

    const { data: ruleSet } = await supabase
      .from("calc_rule_sets")
      .select("id, version, payload_hash, payload")
      .eq("id", manifest.active_rule_set_id)
      .maybeSingle();

    const payload = ruleSet?.payload as SnowboardCalculationRules | undefined;
    if (
      !payload ||
      !Array.isArray(payload.styles) ||
      typeof payload.stanceWidthFromHeightFactor !== "number"
    ) {
      return DEFAULT_SNOWBOARD_RULES;
    }

    return {
      ...payload,
      appliedRuleset: {
        id: String(ruleSet!.id),
        version: ruleSet!.version,
        hash: ruleSet!.payload_hash,
      },
    };
  } catch {
    return DEFAULT_SNOWBOARD_RULES;
  }
}
