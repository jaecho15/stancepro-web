// Shapes of the Supabase snow serving tables (snake_case, used as-is).
// Short-range: public.short_range_forecasts payload/summary — same jsonb the
// iOS app decodes (ShortRangeSnowRepository). Seasonal: public.seasonal_snow_outlooks.

export type BandKey = "base" | "mid" | "top";

export interface SnowResort {
  resort_id: string;
  display_name: string;
  country_code: string;
  region_id: string | null;
  lat: number;
  lon: number;
  base_elevation_m: number | null;
  top_elevation_m: number | null;
}

export interface TimeBlock {
  block: string;
  hours: string;
  n_models: number;
  wind_kmh: number | null;
  rain_risk: boolean;
  temp_c_p50: number | null;
  precip_type: string | null;
  snow_cm_p10: number;
  snow_cm_p50: number;
  snow_cm_p90: number;
  wind_dir_deg: number | null;
  precip_mm_p50: number | null;
  wind_gust_kmh: number | null;
  freezing_level_m: number | null;
}

export interface DailyRow {
  band: BandKey;
  date: string;
  layer: string;
  day_index: number;
  n_models: number;
  elevation_m: number | null;
  rain_risk: boolean;
  snow_cm_p10: number;
  snow_cm_p50: number;
  snow_cm_p90: number;
  tmean_c_p50: number | null;
  wind_kmh: number | null;
  wind_gust_kmh: number | null;
  wind_dir_deg: number | null;
  precip_mm_p50: number | null;
  freezing_level_m: number | null;
  // Metres of headroom between the band and the rain–snow line; negative =
  // the line sits above this band (mixed precip). Drives the precip icon.
  snow_level_margin_m?: number | null;
  time_of_day?: TimeBlock[];
}

export interface TendencyWeek {
  week: string;
  date_start: string;
  date_end: string;
  n_members: number;
  confidence: string;
  snow_cm_p10: number;
  snow_cm_p50: number;
  snow_cm_p90: number;
  tmean_c_p50: number | null;
  prob_snow_ge_10cm: number | null;
  prob_snow_ge_30cm: number | null;
}

export interface SnowDepth {
  asof: string;
  base_cm: number | null;
  mid_cm: number | null;
  top_cm: number | null;
  estimate: boolean;
  // Provenance (additive; older cached rows lack them): what anchored the
  // absolute level, and the latest satellite snow-cover read used for gating.
  source?: "model" | "station";
  station?: {
    id?: string;
    name?: string;
    network?: string;
    distance_km?: number;
    elevation_m?: number;
    asof?: string;
  } | null;
  snowline?: {
    status?: string;
    snowline_m?: number | null;
    obs_date?: string;
  } | null;
}

export interface ForecastPayload {
  resort_id: string;
  lat: number;
  lon: number;
  country_code?: string;
  region_id?: string;
  generated_utc: string;
  models: string[];
  // band → elevation in metres (null when the resort has no top/base data)
  bands: Partial<Record<BandKey, number | null>>;
  daily: DailyRow[];
  depth?: SnowDepth;
  tendency_weekly?: TendencyWeek[];
}

export interface ForecastSummary {
  generated_utc: string;
  models: string[];
  bands: Partial<Record<BandKey, { elevation_m: number | null; snow_7d_p50: number }>>;
  best_day?: {
    band: BandKey;
    date: string;
    day_index: number;
    snow_cm_p10: number;
    snow_cm_p50: number;
    snow_cm_p90: number;
  } | null;
}

export interface ForecastResponse {
  resort_id: string;
  cached?: boolean;
  config_version?: string;
  generated_at?: string;
  payload: ForecastPayload;
  summary: ForecastSummary | null;
}

// --- Seasonal outlook (4-layer: trend / ENSO signal / analogs / watch) ---

export interface SeasonalTrend {
  direction: "increasing" | "decreasing" | "stable";
  pct_per_decade: number;
}

export interface SeasonalAnalog {
  year: number;
  nino34: number;
  pdo: number;
  pct: number;
  bucket: "above" | "near" | "below";
}

export interface SeasonalSignal {
  driver: string;
  lean: "above" | "below" | "near";
  confidence: string;
  probabilities: { above: number; near: number; below: number };
  analogs: SeasonalAnalog[];
  analog_summary: { above: number; near: number; below: number; mean_pct: number };
}

export interface SeasonalWatchFactor {
  factor: string;
  confidence: string;
  direction: string;
  sigma: number;
  detail: string;
  note: string;
}

export interface SeasonalPayload {
  region: string;
  label: string;
  trend: SeasonalTrend;
  signal: SeasonalSignal | null;
  watch: SeasonalWatchFactor[];
}

export interface SeasonalOutlookRow {
  climate_region: string;
  label: string;
  region_ids: string[];
  resort_ids: string[];
  payload: SeasonalPayload;
  enso_state: {
    nino34: number;
    state: string;
    strength: string;
    latest_season?: string | null;
  };
  target_season: string;
  generated_at: string | null;
}
