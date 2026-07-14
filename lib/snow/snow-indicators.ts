// Snow Indicators panel — data contract + demo data.
//
// PURPOSE: describe whether snow-supporting conditions are currently detected
// for a region, over which lead time, and how historically reliable the signal
// is. It does NOT predict snowfall amounts or a "chance of snow" number. Three
// lead-time stages are kept separate (seasonal background / developing pattern /
// snow setup); signal strength, model confidence and historical relevance are
// distinct values and are never fused into a single score.
//
// ⚠️ The data below is DEMO / PLACEHOLDER — hand-authored to validate the design,
// not real meteorology. Every panel is flagged `isDemo` and surfaced as such in
// the UI. Real values must come from the climate / forecast pipelines.

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
  // seasonal
  | "favourable"
  | "neutral"
  | "unfavourable"
  | "mixed"
  | "unclear"
  // developing
  | "detected"
  | "emerging"
  | "weak"
  | "conflicting"
  | "not_detected"
  // snow setup
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
  "These indicators describe whether atmospheric and oceanic conditions that favour snowfall are currently detected for this region. They do not predict or guarantee snowfall, snow depth or snow quality on any particular date.";

// --- Deterministic overall-summary generator (requirement #6) --------------
// Builds one honest sentence from the three stage statuses. No probabilities,
// no amounts.

function stageStatus(stages: SnowSignalStage[], id: StageId): SignalStageStatus | null {
  return stages.find((s) => s.id === id)?.status ?? null;
}

// Two-stage summary: seasonal background + developing (2–6 week) pattern. The
// short range (next ~2 weeks) is the resort's 16-day forecast, so summaries
// point there rather than restating it.
export function generateOverallSummary(stages: SnowSignalStage[]): string {
  const seasonal = stageStatus(stages, "seasonal");
  const developing = stageStatus(stages, "developing");
  const shortRange = " For the next two weeks, see the resort's 16-day forecast.";

  if (developing === "conflicting") {
    return "Medium-range signals are present but the models disagree, so confidence is low." + shortRange;
  }
  if (seasonal === "favourable" && (developing === "detected" || developing === "emerging")) {
    return "The seasonal background is favourable and a medium-range pattern is starting to support it." + shortRange;
  }
  if (seasonal === "favourable") {
    return "The seasonal background is relatively favourable, but no medium-range pattern to support it has established yet." + shortRange;
  }
  if ((seasonal === "neutral" || seasonal === "mixed") && (developing === "detected" || developing === "emerging")) {
    return "The seasonal background is neutral, but a medium-range pattern is showing signs of turning favourable." + shortRange;
  }
  if (seasonal === "unfavourable") {
    return "The seasonal background is leaning unfavourable this season." + shortRange;
  }
  return "The seasonal background shows no strong lean, and no medium-range pattern stands out yet." + shortRange;
}

// --- DEMO data -------------------------------------------------------------
// Region-specific indicator sets per the design. Clearly placeholder values.

const NISEKO: RegionalSnowIndicatorPanel = {
  regionId: "jp_hokkaido",
  regionName: "Hokkaido (West)",
  overallSummary: "",
  disclaimer: SNOW_INDICATORS_DISCLAIMER,
  updatedAt: "2026-07-14",
  isDemo: true,
  stages: [
    {
      id: "seasonal",
      title: "Seasonal Background",
      leadTimeLabel: "~1–6 months",
      status: "favourable",
      confidence: "moderate",
      summary: "Large-scale circulation partly resembles past heavy Hokkaido winters.",
      indicators: [
        {
          id: "enso",
          label: "ENSO background",
          category: "teleconnection",
          currentValue: "Weak La Niña",
          currentCondition: "Weak La Niña",
          snowContribution: "slightly_favourable",
          confidence: "high",
          historicalRelevance: "weak",
          description: "La Niña winters lean slightly snowier in Hokkaido, but the link is weak.",
          updatedAt: "2026-07-08",
        },
        {
          id: "t850_seasonal",
          label: "Seasonal T850 anomaly",
          category: "temperature",
          currentValue: "Below normal (model)",
          currentCondition: "Below normal",
          snowContribution: "favourable",
          confidence: "moderate",
          historicalRelevance: "moderate",
          description: "Seasonal models lean cold at the 850 hPa level over the region.",
          updatedAt: "2026-07-10",
        },
        {
          id: "sea_of_japan_sst",
          label: "East Sea / Sea of Japan SST (add-on)",
          category: "moisture",
          currentValue: "Slightly warm",
          currentCondition: "Slightly above normal",
          snowContribution: "slightly_favourable",
          confidence: "moderate",
          historicalRelevance: "weak",
          description:
            "A warmer sea can add moisture, but only matters alongside enough low-level cold — an add-on, not the headline.",
          updatedAt: "2026-07-10",
        },
      ],
    },
    {
      id: "developing",
      title: "Developing Pattern",
      leadTimeLabel: "Weeks 3–5",
      status: "not_detected",
      confidence: "insufficient_data",
      summary: "No sub-seasonal circulation signal is being served for this window yet.",
      indicators: [
        {
          id: "s2s_placeholder",
          label: "Sub-seasonal circulation",
          category: "model_agreement",
          currentCondition: "No data",
          snowContribution: "unknown",
          confidence: "insufficient_data",
          historicalRelevance: "insufficient_data",
          description:
            "MJO, blocking, jet position and ensemble agreement are not modelled/served for the 2–6 week window yet.",
          updatedAt: "2026-07-14",
        },
      ],
    },
  ],
};

const HAKUBA: RegionalSnowIndicatorPanel = {
  regionId: "jp_central_honshu",
  regionName: "Central Japan (Nagano)",
  overallSummary: "",
  disclaimer: SNOW_INDICATORS_DISCLAIMER,
  updatedAt: "2026-07-14",
  isDemo: true,
  stages: [
    {
      id: "seasonal",
      title: "Seasonal Background",
      leadTimeLabel: "~1–6 months",
      status: "neutral",
      confidence: "low",
      summary: "No strong seasonal lean either way for central Japan.",
      indicators: [
        {
          id: "enso",
          label: "ENSO background",
          category: "teleconnection",
          currentValue: "Weak La Niña",
          currentCondition: "Weak La Niña",
          snowContribution: "neutral",
          confidence: "high",
          historicalRelevance: "weak",
          description: "The ENSO link to central-Honshu snowfall is weak and inconsistent.",
          updatedAt: "2026-07-08",
        },
        {
          id: "t850_seasonal",
          label: "Seasonal T850 anomaly",
          category: "temperature",
          currentValue: "Near normal",
          currentCondition: "Near normal",
          snowContribution: "neutral",
          confidence: "low",
          historicalRelevance: "moderate",
          description: "Seasonal temperature guidance is close to average.",
          updatedAt: "2026-07-10",
        },
      ],
    },
    {
      id: "developing",
      title: "Developing Pattern",
      leadTimeLabel: "Weeks 3–5",
      status: "not_detected",
      confidence: "insufficient_data",
      summary: "Sub-seasonal circulation is not served for this window yet.",
      indicators: [
        {
          id: "s2s_placeholder",
          label: "Sub-seasonal circulation",
          category: "model_agreement",
          currentCondition: "No data",
          snowContribution: "unknown",
          confidence: "insufficient_data",
          historicalRelevance: "insufficient_data",
          description: "The 2–6 week circulation signal is not modelled/served yet.",
          updatedAt: "2026-07-14",
        },
      ],
    },
  ],
};

const WHISTLER: RegionalSnowIndicatorPanel = {
  regionId: "ca_coastal_bc",
  regionName: "Coastal BC (Pacific NW)",
  overallSummary: "",
  disclaimer: SNOW_INDICATORS_DISCLAIMER,
  updatedAt: "2026-07-14",
  isDemo: true,
  stages: [
    {
      id: "seasonal",
      title: "Seasonal Background",
      leadTimeLabel: "~1–6 months",
      status: "mixed",
      confidence: "moderate",
      summary: "ENSO leans one way while the storm track guidance is unclear.",
      indicators: [
        {
          id: "enso",
          label: "ENSO background",
          category: "teleconnection",
          currentValue: "Weak La Niña",
          currentCondition: "Weak La Niña",
          snowContribution: "slightly_favourable",
          confidence: "high",
          historicalRelevance: "moderate",
          description: "La Niña tends to favour the Pacific Northwest, but with wide spread.",
          updatedAt: "2026-07-08",
        },
        {
          id: "storm_track_seasonal",
          label: "Seasonal storm track",
          category: "storm_track",
          currentCondition: "Unclear",
          snowContribution: "unknown",
          confidence: "insufficient_data",
          historicalRelevance: "moderate",
          description: "Seasonal storm-track guidance for this coast is inconclusive.",
          updatedAt: "2026-07-10",
        },
      ],
    },
    {
      id: "developing",
      title: "Developing Pattern",
      leadTimeLabel: "Weeks 3–5",
      status: "not_detected",
      confidence: "insufficient_data",
      summary: "Sub-seasonal circulation is not served for this window yet.",
      indicators: [
        {
          id: "s2s_placeholder",
          label: "Sub-seasonal circulation",
          category: "model_agreement",
          currentCondition: "No data",
          snowContribution: "unknown",
          confidence: "insufficient_data",
          historicalRelevance: "insufficient_data",
          description: "MJO, blocking and jet-position signals are not served yet.",
          updatedAt: "2026-07-14",
        },
      ],
    },
  ],
};

const PANELS: Record<string, RegionalSnowIndicatorPanel> = {
  jp_hokkaido: NISEKO,
  jp_central_honshu: HAKUBA,
  ca_coastal_bc: WHISTLER,
};

/** DEMO Snow Indicators panel for a browse region_id, or null if none. */
export function snowIndicatorPanel(
  regionId: string | null | undefined
): RegionalSnowIndicatorPanel | null {
  if (!regionId) return null;
  const panel = PANELS[regionId];
  if (!panel) return null;
  return { ...panel, overallSummary: generateOverallSummary(panel.stages) };
}
