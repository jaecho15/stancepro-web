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
  /** WMO weather interpretation code (Open-Meteo). Optional on older caches. */
  weather_code?: number | null;
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
  // Developing-event context: the tercile probabilities stay on the calibrated
  // 3-month ONI (`oni`); `monthly` (latest month) leads it when an event is
  // fast-changing. Shown as a note, never folded into the probabilities.
  momentum?: { state: "strengthening" | "steady" | "weakening"; monthly: number; oni: number };
}

export interface SeasonalWatchFactor {
  factor: string;
  confidence: string;
  direction: string;
  sigma: number;
  detail: string;
  note: string;
}

// Southern-hemisphere in-progress winters serve OBSERVED season status
// instead of a forecast (payload.mode === "in_season_status"). Contract from
// the climate session (in_season_status_v1): honest observations only.
export interface SeasonalStatus {
  season: string;
  asof: string;
  season_to_date_cm: number;
  climatology_median_cm: number;
  percentile: number; // rank among 35 winters, 0–100
  last14d_cm: number;
  last14d_median_cm: number;
  tendency: "above" | "near" | "below";
  points: number;
  snow_cover?: { covered: number; partial: number; bare: number } | null;
}

// Year-by-year record (annual_history_v1): per-season modeled snowfall from
// the ERA5 reanalysis snowfall budget (precip + temp, tmean ≤ +1°C, SLR 10:1),
// averaged over ≤3 curated mid-elevation resorts. Modeled, not measured.
// NH years are labelled by the DJF end year; SH by the JJA year.
export interface SeasonalHistoryPoint {
  year: number;
  snow_cm: number;
}
export interface SeasonalHistoryBaseline {
  median_cm: number;
  p10_cm: number;
  p90_cm: number;
}
export interface SeasonalHistoryCurrent {
  year: number;
  snow_cm: number;
  partial: boolean; // the in-progress season (SH only while NH is off-season)
}

// Winter rain/snow-line elevation, derived from the same ERA5 pull as the
// snowfall history (precip-weighted, temp crosses +1°C, 6.5°C/km lapse from
// mid elevation). Render in a shared-year combined chart as the LOWER band under
// snowfall (separate m scale on the right) — not overlaid on the same plot.
// Absolute metres are modeled (assumed lapse rate); the rising trend is the
// robust warming signal even where snowfall looks flat.
export interface SeasonalSnowlinePoint {
  year: number;
  snowline_m: number;
}
export interface SeasonalSnowlineBaseline {
  median_m: number;
  p10_m: number;
  p90_m: number;
}
export interface SeasonalSnowlineTrend {
  direction: "rising" | "falling" | "stable"; // "stable" when not p<0.05 significant
  m_per_decade: number;
}

// Climate-driver profile (driver_profiles): the large-scale index this region's
// winter snow historically tracks, from a 45-yr ERA5 survey. Honest by design —
// most regions have no serveable seasonal signal (index=null), and even where
// there is one, subseasonal drivers (NAO/AO/SAM) are only usable at 2–4 weeks,
// not months ahead. `index_series` colours each year on the history chart by its
// index phase; `current_signal` lights a "favorable now" badge only in-season.
export type ClimateIndex = "ENSO" | "NAO" | "AO" | "SAM";

export interface ClimateDriver {
  index: ClimateIndex | null;      // null = no serveable signal (region variability rules)
  sign: "+" | "-" | null;          // + = snowier in the index's positive phase
  r: number | null;                // correlation strength over the record
  predictability: "seasonal" | "subseasonal" | null; // ENSO seasonal; NAO/AO/SAM 2–4wk
  weak: boolean;                   // 0.25 ≤ |r| < 0.30 — show, but labelled weak
  // Stability of the historical index↔snow link (distinct from predictability).
  // Curated from verified detrend/CV analysis — never auto-derived from raw r.
  historical_relevance?: "strong" | "moderate" | "weak" | "unstable" | "insufficient_data";
  index_series?: Record<string, number>; // year → index value (chart colouring)
  current_index?: number | null;   // latest index value
  current_signal?: "positive" | "neutral" | null; // in-season favorable flag
  in_season?: boolean;             // true only during this region's winter
}

export interface SeasonalPayload {
  region: string;
  label: string;
  trend: SeasonalTrend;
  signal: SeasonalSignal | null;
  watch: SeasonalWatchFactor[];
  mode?: string; // "in_season_status" for observed SH rows; absent on forecasts
  status?: SeasonalStatus | null;
  history?: SeasonalHistoryPoint[];
  history_baseline?: SeasonalHistoryBaseline | null;
  history_current?: SeasonalHistoryCurrent | null;
  snowline_history?: SeasonalSnowlinePoint[];
  snowline_baseline?: SeasonalSnowlineBaseline | null;
  snowline_trend?: SeasonalSnowlineTrend | null;
  driver?: ClimateDriver | null;
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
