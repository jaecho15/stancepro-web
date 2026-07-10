import type { SeasonalOutlookRow, SeasonalStatus } from "./types";

// Presentation helpers for in-progress-season status rows
// (payload.mode === "in_season_status").

export function isSeasonStatus(row: SeasonalOutlookRow): boolean {
  return row.payload.mode === "in_season_status" && !!row.payload.status;
}

/** Map the season-to-date percentile onto the same above/near/below scale the
 *  forecast cards use, so map colours and accents stay consistent. */
export function statusLean(status: SeasonalStatus): "above" | "near" | "below" {
  if (status.percentile >= 67) return "above";
  if (status.percentile <= 33) return "below";
  return "near";
}

export function statusHeadline(status: SeasonalStatus): string {
  const p = status.percentile;
  if (p <= 10) return "Historically dry season so far";
  if (p <= 33) return "Below-normal season so far";
  if (p < 67) return "Near-normal season so far";
  if (p < 90) return "Above-normal season so far";
  return "Exceptional season so far";
}

export function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}
