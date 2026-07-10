import { DEFAULT_SNOWBOARD_RULES } from "./default-rules";
import {
  BUNDLED_SNOWBOARD_RULESET,
  type BindingAnglePair,
  type BindingAngleProfile,
  type SnowboardCalculationInput,
  type SnowboardCalculationResult,
  type SnowboardCalculationRules,
} from "./types";

// Port of StancePro iOS StanceCalculationService.swift (snowboard engine).
// Verified against the Swift original with a differential test harness —
// keep the two in lockstep when either side changes.

// Swift's round() rounds half away from zero; Math.round rounds half toward
// +Infinity, which differs for negative angles (e.g. -2.5).
function swiftRound(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

// Swift Int division truncates toward zero (-9/2 === -4), unlike Math.floor.
function intDiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function safeIndex<T>(array: T[] | undefined, index: number): T | undefined {
  if (!array || index < 0 || index >= array.length) return undefined;
  return array[index];
}

const STATIC_STYLES = ["All-Mountain", "Ground-Tricks", "Freeride", "Park", "Powder", "Carving"];
const STATIC_SWITCH_OPTIONS = ["No", "Yes"];
const STATIC_SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced"];

const STYLE_NAME_MAPPING: Record<string, string> = {
  "All Mountain": "All-Mountain",
  "All mountain": "All-Mountain",
  "all mountain": "All-Mountain",
  "all-mountain": "All-Mountain",
  AllMountain: "All-Mountain",
  Freeride: "Freeride",
  "free ride": "Freeride",
  "free-ride": "Freeride",
  FreerRide: "Freeride",
  GroundTricks: "Ground-Tricks",
  "ground tricks": "Ground-Tricks",
  "ground-tricks": "Ground-Tricks",
  freestyle: "Ground-Tricks",
};

export function normalizeRidingStyle(style: string): string {
  return STYLE_NAME_MAPPING[style] ?? style;
}

function carvingWidthMultiplier(
  style: string,
  carvingStanceType: string | null | undefined,
  rules: SnowboardCalculationRules
): number | undefined {
  if (style !== "Carving" || !carvingStanceType) return undefined;
  return (
    rules.carvingStanceProfiles?.[carvingStanceType]?.widthMultiplier ??
    DEFAULT_SNOWBOARD_RULES.carvingStanceProfiles?.[carvingStanceType]?.widthMultiplier
  );
}

function bindingAngleProfile(
  style: string,
  rules: SnowboardCalculationRules
): BindingAngleProfile {
  return (
    rules.bindingAngleProfiles?.[style] ??
    DEFAULT_SNOWBOARD_RULES.bindingAngleProfiles?.[style] ?? {
      frontRange: { min: 15, max: 21 },
      rearRange: { min: -9, max: -3 },
      skillAngles: {
        Beginner: { front: 15, rear: -9 },
        Intermediate: { front: 18, rear: -6 },
        Advanced: { front: 21, rear: -3 },
      },
    }
  );
}

function anglePair(
  skillLevel: string,
  profile: BindingAngleProfile
): BindingAnglePair | undefined {
  return profile.skillAngles[skillLevel] ?? profile.skillAngles["Intermediate"];
}

function refinedCarvingAngles(
  skillLevel: string,
  carvingStanceType: string | null | undefined,
  rules: SnowboardCalculationRules
): { front: string; rear: string } | undefined {
  if (!carvingStanceType) return undefined;
  const profile =
    rules.carvingStanceProfiles?.[carvingStanceType] ??
    DEFAULT_SNOWBOARD_RULES.carvingStanceProfiles?.[carvingStanceType];
  if (!profile) return undefined;
  const base = profile.skillAngles[skillLevel] ?? profile.skillAngles["Intermediate"];
  if (!base) return undefined;

  let rear = base.rear;
  if (profile.rearMax !== undefined && profile.rearMax !== null) {
    rear = Math.min(rear, profile.rearMax);
  }
  return { front: `+${base.front}°`, rear: `${rear >= 0 ? "+" : ""}${rear}°` };
}

export function calculateBindingAngles(
  styleIndex: number,
  switchIndex: number,
  skillLevelIndex: number,
  flexibility: string = "Medium",
  hasInjury: boolean = false,
  carvingStanceType: string | null | undefined = null,
  rules: SnowboardCalculationRules = DEFAULT_SNOWBOARD_RULES
): { front: string; rear: string } {
  const style = normalizeRidingStyle(
    safeIndex(rules.styles, styleIndex) ?? safeIndex(STATIC_STYLES, styleIndex) ?? "All-Mountain"
  );
  const ridesSwitch =
    (safeIndex(rules.switchOptions, switchIndex) ??
      safeIndex(STATIC_SWITCH_OPTIONS, switchIndex) ??
      "No") === "Yes";
  const skillLevel =
    safeIndex(rules.skillLevelOptions, skillLevelIndex) ??
    safeIndex(STATIC_SKILL_LEVELS, skillLevelIndex) ??
    "Intermediate";
  const profile = bindingAngleProfile(style, rules);

  if (style === "Carving") {
    const carved = refinedCarvingAngles(skillLevel, carvingStanceType, rules);
    if (carved) return carved;
  }

  if (style === "Park") {
    const pair = anglePair(skillLevel, profile) ?? { front: 12, rear: -10 };
    let front = pair.front;
    let rear = pair.rear;

    if (flexibility === "Low") {
      front -= 2;
      rear += 1;
    } else if (flexibility === "High") {
      front += 2;
      rear -= 1;
    }

    if (ridesSwitch) {
      rear = skillLevel === "Advanced" || flexibility === "High" ? -12 : -11;
      if (Math.abs(rear) > front) {
        front = Math.abs(rear);
      }
    }

    front = clampInt(front, profile.frontRange.min, profile.frontRange.max);
    rear = clampInt(rear, profile.rearRange.min, profile.rearRange.max);

    front = swiftRound(front / 3.0) * 3;
    rear = swiftRound(rear / 3.0) * 3;

    front = clampInt(front, profile.frontRange.min, profile.frontRange.max);
    rear = clampInt(rear, profile.rearRange.min, profile.rearRange.max);

    if (Math.abs(rear) > front) {
      front = clampInt(Math.abs(rear), profile.frontRange.min, profile.frontRange.max);
    }

    return { front: `+${front}°`, rear: `${rear >= 0 ? "+" : ""}${rear}°` };
  }

  const frontRange = { lo: profile.frontRange.min, hi: profile.frontRange.max };
  const rearRange = { lo: profile.rearRange.min, hi: profile.rearRange.max };
  const basePair = anglePair(skillLevel, profile) ?? {
    front: intDiv(frontRange.lo + frontRange.hi, 2),
    rear: intDiv(rearRange.lo + rearRange.hi, 2),
  };

  let front = basePair.front;
  let rear = basePair.rear;

  // Apply flexibility
  const flexAdjust = flexibility === "Low" ? -3 : flexibility === "High" ? 3 : 0;
  front = clampInt(front + flexAdjust, frontRange.lo, frontRange.hi);
  rear = rear + (rear < 0 ? -flexAdjust : flexAdjust);
  rear = clampInt(rear, rearRange.lo, rearRange.hi);

  // Switch adjustment
  if (ridesSwitch) {
    if (style === "Ground-Tricks" || style === "Park") {
      rear = -front;
    } else if (style === "All-Mountain" || style === "Freeride") {
      if (rear < 0) {
        front -= 2;
        rear -= 2;
      } else {
        front -= 2;
        rear = -3;
      }

      front = Math.max(front, frontRange.lo);

      if (Math.abs(front) + Math.abs(rear) < 21) {
        const currentSpread = Math.abs(front) + Math.abs(rear);
        const deficit = 21 - currentSpread;
        const adjustment = intDiv(deficit + 1, 2);

        front += adjustment;
        if (rear < 0) {
          rear -= adjustment;
        } else {
          rear = -adjustment;
        }
      }
    } else if (style === "Powder") {
      if (rear <= 0) {
        rear = Math.max(rear, -intDiv(front, 2));
      }
    } else if (style === "Carving") {
      rear = Math.max(rear, intDiv(front, 2));
    }
  }

  // Injury adjustment: clamp spread to 24
  if (hasInjury) {
    const spread = Math.abs(front) + Math.abs(rear);
    if (spread > 24) {
      const factor = 24.0 / spread;
      front = swiftRound(front * factor);
      rear = swiftRound(rear * factor);
    }
  }

  // Freeride switch enforcement: |rear| >= 6
  if (style === "Freeride" && ridesSwitch) {
    if (rear <= 0) {
      rear = Math.min(rear, -6);
    } else {
      rear = -6;
    }
    rear = Math.max(rear, rearRange.lo);
    if (Math.abs(front) < Math.abs(rear)) {
      front = Math.abs(rear);
    }
  }

  // Rule 1: abs(front) + abs(rear) >= 21
  if (Math.abs(front) + Math.abs(rear) < 21) {
    front = Math.max(front, 21 - Math.abs(rear));
  }
  // Rule 2: front >= abs(rear), or front >= rear when rear > 0 (Carving)
  if (rear <= 0 && Math.abs(front) < Math.abs(rear)) {
    front = Math.abs(rear);
  } else if (rear > 0 && style === "Carving" && front < rear) {
    front = rear;
  }
  // Rule 3: rear <= 0 except Carving
  if (rear > 0 && style !== "Carving") {
    rear = 0;
  }

  // Safety net: maximum binding spread
  const currentSpread = Math.abs(front) + Math.abs(rear);
  let maxAllowedSpread = 30;
  if (skillLevel === "Beginner") {
    maxAllowedSpread = 27;
  }
  if (hasInjury) {
    maxAllowedSpread = 24;
  }

  if (currentSpread > maxAllowedSpread) {
    const scaleFactor = maxAllowedSpread / currentSpread;
    front = swiftRound(front * scaleFactor);
    rear = swiftRound(rear * scaleFactor);
    front = Math.max(front, frontRange.lo);

    if (rear <= 0 && Math.abs(front) < Math.abs(rear)) {
      const difference = Math.abs(rear) - front;
      const halfDiff = intDiv(difference, 2);
      front += halfDiff;
      if (rear < 0) {
        rear += halfDiff;
      } else {
        rear -= halfDiff;
      }
    }
  }

  // Round to nearest multiple of 3
  front = swiftRound(front / 3.0) * 3;
  rear = swiftRound(rear / 3.0) * 3;

  return { front: `+${front}°`, rear: `${rear >= 0 ? "+" : ""}${rear}°` };
}

export function calculateHighbackLean(styleIndex: number, skillLevelIndex: number): string {
  const style = safeIndex(STATIC_STYLES, styleIndex) ?? "All-Mountain";
  const skillLevel = safeIndex(STATIC_SKILL_LEVELS, skillLevelIndex) ?? "Intermediate";

  let leanRange: { min: number; max: number } = { min: 0, max: 0 };
  switch (style) {
    case "Ground-Tricks":
      leanRange = { min: 0, max: 3 };
      break;
    case "Park":
      leanRange = { min: 3, max: 6 };
      break;
    case "All-Mountain":
      leanRange = { min: 6, max: 9 };
      break;
    case "Freeride":
      leanRange = { min: 9, max: 12 };
      break;
    case "Powder":
      leanRange = { min: 6, max: 9 };
      break;
    case "Carving":
      leanRange = { min: 12, max: 15 };
      break;
  }

  let lean: number;
  switch (skillLevel) {
    case "Beginner":
      lean = leanRange.min;
      break;
    case "Intermediate":
      lean = intDiv(leanRange.min + leanRange.max, 2);
      break;
    case "Advanced":
    case "Expert":
      lean = leanRange.max;
      break;
    default:
      lean = leanRange.min;
  }

  return `${lean}°`;
}

export function recommendBoardShape(
  styleIndex: number,
  switchRiding: number,
  _skillLevel: number
): string {
  const style = safeIndex(STATIC_STYLES, styleIndex) ?? "All-Mountain";
  const ridesSwitch = (safeIndex(STATIC_SWITCH_OPTIONS, switchRiding) ?? "No") === "Yes";

  switch (style) {
    case "Ground-Tricks":
    case "Park":
      return ridesSwitch ? "True Twin Board" : "Directional Twin Board";
    case "Freeride":
      return ridesSwitch ? "Directional Twin Board" : "Directional or Directional Twin Board";
    case "All-Mountain":
      return ridesSwitch ? "True Twin Board" : "Directional Twin Board";
    case "Powder":
      return "Directional Board";
    case "Carving":
      return ridesSwitch ? "Directional Twin Board" : "Directional Board";
    default:
      return "Directional Twin Board";
  }
}

export function calculateLegLengthFromHeight(height: number): number {
  return Math.round(height * 0.5 * 10) / 10;
}

export function calculateResult(
  input: SnowboardCalculationInput,
  rules: SnowboardCalculationRules = DEFAULT_SNOWBOARD_RULES
): SnowboardCalculationResult {
  const rawStyle = safeIndex(rules.styles, input.styleIndex) ?? "All-Mountain";
  const style = normalizeRidingStyle(rawStyle);
  const bodyFlex = safeIndex(rules.flexibilityOptions, input.bodyFlexIndex) ?? "Medium";
  const coreStrength =
    safeIndex(rules.coreStrengthOptions, input.coreStrengthIndex) ?? "Moderate";
  const skillLevel = safeIndex(rules.skillLevelOptions, input.skillLevelIndex) ?? "Intermediate";

  const baseWidth = input.useHeightForBase
    ? input.height * rules.stanceWidthFromHeightFactor
    : input.legLength * rules.stanceWidthFromLegFactor;

  const styleAdjustment =
    carvingWidthMultiplier(style, input.carvingStanceType, rules) ??
    rules.ridingStyleAdjustments[style] ??
    1.0;
  const flexAdjustment = rules.bodyFlexWidthMultipliers[bodyFlex] ?? 1.0;
  const coreAdjustment = rules.coreStrengthWidthMultipliers[coreStrength] ?? 1.0;
  const injuryAdjustment = input.hasInjury ? rules.injuryWidthMultiplier : 1.0;

  const bootFlexAdjustment = 1.0 + (input.bootFlex - 5.0) * rules.bootFlexSlope;
  const boardFlexAdjustment = 1.0 + (input.boardFlex - 5.0) * rules.boardFlexSlope;
  const bindingFlexAdjustment = 1.0 + (input.bindingFlex - 5.0) * rules.bindingFlexSlope;

  const finalWidth =
    baseWidth *
    styleAdjustment *
    flexAdjustment *
    coreAdjustment *
    injuryAdjustment *
    bootFlexAdjustment *
    boardFlexAdjustment *
    bindingFlexAdjustment;
  const roundedWidth = swiftRound(finalWidth * 2) / 2;

  const bindingAngles = calculateBindingAngles(
    input.styleIndex,
    input.switchIndex,
    input.skillLevelIndex,
    bodyFlex,
    input.hasInjury,
    input.carvingStanceType,
    rules
  );
  const highbackLean = calculateHighbackLean(input.styleIndex, input.skillLevelIndex);

  const baseBoardLength = input.height * rules.boardLengthHeightFactor;
  const idealWeight = rules.boardLengthReferenceBMI * Math.pow(input.height / 100.0, 2);
  const weightRatio = input.weight / idealWeight;
  const weightAdjustment = Math.max(
    -rules.boardLengthWeightAdjustmentClamp,
    Math.min(
      rules.boardLengthWeightAdjustmentClamp,
      rules.boardLengthWeightAdjustmentSlope * (weightRatio - 1.0)
    )
  );
  const weightAdjustedLength = baseBoardLength + weightAdjustment;
  const styleLengthMultiplier = rules.boardLengthStyleMultipliers[style] ?? 1.0;
  const adjustedBoardLength = swiftRound(weightAdjustedLength * styleLengthMultiplier);

  // Board model suggestions require the equipment catalog; the web calculator
  // omits them for now (the iOS engine also returns [] when the catalog is absent).
  const suggestedModels: string[] = [];

  return {
    width: roundedWidth,
    frontAngle: bindingAngles.front,
    rearAngle: bindingAngles.rear,
    method: style,
    boardLength: adjustedBoardLength,
    suggestedModels,
    highbackLean,
    appliedRuleset: rules.appliedRuleset ?? BUNDLED_SNOWBOARD_RULESET,
    carvingStanceType: input.carvingStanceType ?? null,
  };
}
