// Snow Indicators panel — derived from the live seasonal payload, not mock.
//
// PURPOSE: show the current STATE of the large-scale climate index this region's
// winter snow historically tracks — favourable / neutral / unfavourable right
// now — plus how confidently we know that state (predictability) and how stable
// the historical index↔snow link has been (historical_relevance, curated by the
// climate pipeline, never auto-derived from raw r). It does NOT predict snowfall
// amounts or a chance-of-snow number. Two lead-time stages: Seasonal Background
// (from payload.driver) and Developing Pattern (2–6 week S2S — not served yet).

import type { SeasonalOutlookRow } from "./types";

export type IndicatorStatus =
  | "favourable"
  | "slightly_favourable"
  | "neutral"
  | "slightly_unfavourable"
  | "unfavourable"
  | "unknown";

export type ConfidenceLevel = "high" | "moderate" | "low" | "insufficient_data";

export type HistoricalRelevance =
  | "strong"
  | "moderate"
  | "weak"
  | "unstable"
  | "insufficient_data";

export type SignalStageStatus =
  | "favourable"
  | "neutral"
  | "unfavourable"
  | "mixed"
  | "unclear"
  | "detected"
  | "emerging"
  | "weak"
  | "conflicting"
  | "not_detected"
  | "active"
  | "possible"
  | "incomplete";

export type IndicatorCategory =
  | "temperature"
  | "moisture"
  | "wind"
  | "storm_track"
  | "teleconnection"
  | "snowline"
  | "terrain"
  | "model_agreement";

export interface SnowIndicator {
  id: string;
  label: string;
  category: IndicatorCategory;
  currentValue?: string;
  currentCondition: string;
  snowContribution: IndicatorStatus;
  confidence: ConfidenceLevel;
  historicalRelevance: HistoricalRelevance;
  description: string;
  source?: string;
  updatedAt: string;
  stale?: boolean;
}

export type StageId = "seasonal" | "developing" | "snow_setup";

export interface SnowSignalStage {
  id: StageId;
  title: string;
  leadTimeLabel: string;
  status: SignalStageStatus;
  confidence: ConfidenceLevel;
  summary: string;
  indicators: SnowIndicator[];
}

export interface RegionalSnowIndicatorPanel {
  regionId: string;
  regionName: string;
  overallSummary: string;
  stages: SnowSignalStage[];
  disclaimer: string;
  updatedAt: string;
  isDemo: boolean;
}

export const SNOW_INDICATORS_DISCLAIMER =
  "These indicators show whether the large-scale climate conditions that favour this region's snow are currently in a supportive state. They do not predict or guarantee snowfall, snow depth or snow quality on any particular date.";

function stageStatus(stages: SnowSignalStage[], id: StageId): SignalStageStatus | null {
  return stages.find((s) => s.id === id)?.status ?? null;
}

// Two-stage summary: seasonal background + developing (2–6 week) pattern. The
// short range (next ~2 weeks) is the resort's 16-day forecast, so summaries
// point there rather than restating it.
export function generateOverallSummary(stages: SnowSignalStage[]): string {
  const seasonal = stageStatus(stages, "seasonal");
  const shortRange = " For the next two weeks, see the resort's 16-day forecast.";

  if (seasonal === "favourable") {
    return "The region's main climate driver is currently in a snow-favourable state." + shortRange;
  }
  if (seasonal === "unfavourable") {
    return "The region's main climate driver is currently in an unfavourable state." + shortRange;
  }
  if (seasonal === "unclear") {
    return "The region's climate driver signal is unclear right now." + shortRange;
  }
  return "The region's main climate driver is in a neutral state right now — no strong lean either way." + shortRange;
}

const INDEX_PHASE = (sign: "+" | "-" | null) =>
  sign === "+" ? "positive" : sign === "-" ? "negative" : "";

const ENSO_STATE_LABEL: Record<string, string> = {
  el_nino: "El Niño",
  la_nina: "La Niña",
  neutral: "ENSO-neutral",
};

// Build the panel from a live seasonal row. Returns null when the region has no
// serveable climate index (payload.driver missing or index=null) — those
// regions show no indicator panel.
export function buildSnowIndicatorPanel(
  row: SeasonalOutlookRow | null | undefined
): RegionalSnowIndicatorPanel | null {
  if (!row) return null;
  const driver = row.payload.driver;
  if (!driver || !driver.index) return null;

  const idx = driver.index; // ENSO | NAO | AO | SAM
  const updatedAt = row.generated_at?.slice(0, 10) ?? "";
  const cur = driver.current_index ?? null;

  let currentCondition: string;
  if (idx === "ENSO" && row.enso_state) {
    const s = row.enso_state;
    const state = ENSO_STATE_LABEL[s.state] ?? s.state;
    const strength = s.strength && s.strength !== "none" ? `${s.strength[0].toUpperCase()}${s.strength.slice(1)} ` : "";
    currentCondition = `${strength}${state} (Niño3.4 ${s.nino34 >= 0 ? "+" : ""}${s.nino34.toFixed(2)})`;
  } else if (cur !== null) {
    currentCondition = `${cur >= 0 ? "+" : ""}${cur.toFixed(2)} (${cur >= 0 ? "positive" : "negative"} phase)`;
  } else {
    currentCondition = "—";
  }

  // current_signal is the in-season "favourable now" flag (positive/neutral/null).
  const snowContribution: IndicatorStatus =
    driver.current_signal === "positive"
      ? "favourable"
      : driver.current_signal === "neutral"
        ? "neutral"
        : "unknown";

  // Confidence = how usable the index is right now: ENSO has seasonal lead;
  // NAO/AO/SAM are only usable at 2–4 weeks, so for the seasonal window: low.
  const confidence: ConfidenceLevel =
    driver.predictability === "seasonal"
      ? "moderate"
      : driver.predictability === "subseasonal"
        ? "low"
        : "insufficient_data";

  const historicalRelevance: HistoricalRelevance =
    driver.historical_relevance ?? "insufficient_data";

  const phase = INDEX_PHASE(driver.sign);
  const description = phase
    ? `This region's winter snow has historically leaned snowier in the ${idx}'s ${phase} phase${
        driver.predictability === "subseasonal" ? " — but only usable 2–4 weeks out, not months ahead" : ""
      }.`
    : `The large-scale climate index tracked for this region.`;

  const indicator: SnowIndicator = {
    id: idx.toLowerCase(),
    label: `${idx} background`,
    category: "teleconnection",
    currentCondition,
    snowContribution,
    confidence,
    historicalRelevance,
    description,
    updatedAt,
  };

  // current_signal only yields favourable / neutral / unknown (never unfavourable).
  const seasonalStatus: SignalStageStatus =
    snowContribution === "favourable"
      ? "favourable"
      : snowContribution === "unknown"
        ? "unclear"
        : "neutral";

  const stages: SnowSignalStage[] = [
    {
      id: "seasonal",
      title: "Seasonal Background",
      leadTimeLabel: "~1–6 months",
      status: seasonalStatus,
      confidence,
      summary: `${idx} is the main large-scale index this region's winter snow has tracked.`,
      indicators: [indicator],
    },
    {
      id: "developing",
      title: "Developing Pattern",
      leadTimeLabel: "Weeks 2–6",
      status: "not_detected",
      confidence: "insufficient_data",
      summary: "Sub-seasonal circulation is not modelled/served for this window yet.",
      indicators: [
        {
          id: "s2s",
          label: "Sub-seasonal circulation",
          category: "model_agreement",
          currentCondition: "No data",
          snowContribution: "unknown",
          confidence: "insufficient_data",
          historicalRelevance: "insufficient_data",
          description:
            "MJO, blocking, jet position and ensemble agreement are not served for the 2–6 week window yet.",
          updatedAt,
        },
      ],
    },
  ];

  return {
    regionId: row.region_ids[0] ?? row.climate_region,
    regionName: row.label,
    overallSummary: generateOverallSummary(stages),
    stages,
    disclaimer: SNOW_INDICATORS_DISCLAIMER,
    updatedAt,
    isDemo: false,
  };
}
