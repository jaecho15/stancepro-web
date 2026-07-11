import { BUNDLED_SKI_RULESET, DEFAULT_DIN_PROFILE, DEFAULT_SKI_RULES } from "./ski-default-rules";
import type {
  DINAgeAdjustmentRule,
  DINBootSoleBucket,
  DINCodeBucket,
  DINStandardProfile,
  SkiCalculationInput,
  SkiCalculationResult,
  SkiCalculationRules,
  SkiDINTrace,
  SkiLengthRecommendation,
  SkiStanceNotes,
} from "./ski-types";

// Port of StancePro iOS SkiStanceCalculationService.swift — verified against
// the unmodified Swift original with the stance-diff harness (ski mode).
//
// ⚠️ DIN values are ESTIMATES ONLY and must be set by a certified technician
// per ISO 11088. This module reproduces the app's reference math verbatim.

type SkiSkillLevel = "beginner" | "intermediate" | "advanced";
type SkiTerrainFocus =
  | "pisteCarving"
  | "allMountain"
  | "powderFreeride"
  | "parkFreestyle"
  | "touring";

// Swift round() = half away from zero.
function swiftRound(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeIndex<T>(array: T[], index: number): T | undefined {
  return index >= 0 && index < array.length ? array[index] : undefined;
}

const DIN_DISCLAIMER =
  "DIN estimate only. A certified ski technician must verify and set your binding release settings. Incorrect settings can cause serious injury.";

function mapTerrainToEngine(terrain: string): SkiTerrainFocus {
  switch (terrain) {
    case "Freeride/Powder":
    case "Powder":
      return "powderFreeride";
    case "Freestyle/Park":
    case "Freestyle":
      return "parkFreestyle";
    case "Touring":
      return "touring";
    case "All-Mountain":
      return "allMountain";
    default:
      return "pisteCarving";
  }
}

function mapSkillToEngine(skillLevel: string): SkiSkillLevel {
  switch (skillLevel) {
    case "Beginner":
      return "beginner";
    case "Advanced":
      return "advanced";
    default:
      return "intermediate";
  }
}

function skillLabel(skill: SkiSkillLevel): string {
  return skill === "beginner" ? "Beginner" : skill === "advanced" ? "Advanced" : "Intermediate";
}

function terrainLabel(terrain: SkiTerrainFocus): string {
  switch (terrain) {
    case "pisteCarving":
      return "Piste/Carving";
    case "allMountain":
      return "All-Mountain";
    case "powderFreeride":
      return "Freeride/Powder";
    case "parkFreestyle":
      return "Freestyle/Park";
    case "touring":
      return "Touring";
  }
}

function makeSizingNotes(
  skill: SkiSkillLevel,
  terrain: SkiTerrainFocus,
  deltaTerrain: number,
  deltaWeight: number,
  snapped: number
): string[] {
  let notes: string[] = [];

  if (skill === "beginner") {
    notes.push("Beginner sizing subtracts length to prioritize control and easier turn initiation.");
  } else if (skill === "intermediate") {
    notes.push("Intermediate sizing stays near neutral for a balanced all-mountain starting point.");
  } else {
    notes.push("Advanced sizing adds length for stronger edge hold and high-speed stability.");
  }

  if (deltaTerrain !== 0) {
    switch (terrain) {
      case "pisteCarving":
        notes.push("Piste/Carving adds a little length for edge hold and frontside confidence.");
        break;
      case "allMountain":
        notes.push("All-Mountain stays close to neutral length for versatility across mixed resort terrain.");
        break;
      case "powderFreeride":
        notes.push("Freeride/Powder adds length for float and directional stability.");
        break;
      case "parkFreestyle":
        notes.push("Freestyle/Park shortens length for spins, switch riding, and maneuverability.");
        break;
      case "touring":
        notes.push("Touring reduces length slightly for efficiency and control.");
        break;
    }
  }

  if (deltaWeight !== 0) {
    const sign = deltaWeight > 0 ? "+" : "";
    notes.push(`Weight adjustment changed length slightly (${sign}${swiftRound(deltaWeight)} cm).`);
  }

  notes.push(`Final recommendation rounded to the nearest whole-centimeter target (${snapped} cm).`);

  if (notes.length > 4) notes = notes.slice(0, 4);
  if (notes.length < 2 && notes.length > 0) notes = [notes[notes.length - 1], notes[notes.length - 1]];
  return notes;
}

export function recommendSkiLength(
  heightCm: number,
  weightKg: number | null,
  skill: SkiSkillLevel,
  terrain: SkiTerrainFocus,
  rules: SkiCalculationRules = DEFAULT_SKI_RULES
): SkiLengthRecommendation {
  const h = heightCm;
  const baseLength = h * rules.skiLengthBaseFactor;

  const referenceWeight = Math.max(
    rules.referenceWeightFloor,
    (h - rules.referenceWeightHeightOffset) * rules.referenceWeightHeightSlope
  );
  const deltaWeight =
    weightKg === null
      ? 0
      : clamp(
          (weightKg - referenceWeight) * rules.weightAdjustmentSlope,
          -rules.weightAdjustmentClamp,
          rules.weightAdjustmentClamp
        );

  const label = skillLabel(skill);
  const deltaSkill = rules.skillLengthAdjustments[label] ?? 0;
  const deltaTerrain = rules.terrainLengthAdjustments[terrainLabel(terrain)] ?? 0;

  const raw = baseLength + deltaWeight + deltaSkill + deltaTerrain;
  const minEnv = h + (rules.skillEnvelopeMinOffsets[label] ?? -12);
  const maxEnv = h + (rules.skillEnvelopeMaxOffsets[label] ?? 2);
  const clamped = clamp(raw, minEnv, maxEnv);
  const snapped = swiftRound(clamped); // no inventory on the web path

  return {
    recommendedCm: snapped,
    minCm: swiftRound(minEnv),
    maxCm: swiftRound(maxEnv),
    rawCm: raw,
    notes: makeSizingNotes(skill, terrain, deltaTerrain, deltaWeight, snapped),
  };
}

function calculateMountOffset(
  terrain: string,
  skillLevel: string,
  rules: SkiCalculationRules
): number {
  if (terrain === "Piste/Carving" && (skillLevel === "Beginner" || skillLevel === "Intermediate")) {
    return 0;
  }
  if (terrain === "All-Mountain") {
    return rules.mountOffsetByTerrain["All-Mountain"] ?? -2;
  }
  if (terrain === "Freeride/Powder" || terrain === "Powder") {
    const fallback = rules.mountOffsetByTerrain["Freeride/Powder"] ?? -6;
    return skillLevel === "Advanced" ? rules.advancedPowderMountOffset : fallback;
  }
  if (terrain === "Freestyle/Park" || terrain === "Freestyle") {
    return rules.mountOffsetByTerrain["Freestyle/Park"] ?? 2;
  }
  if (terrain === "Touring") {
    return rules.mountOffsetByTerrain["Touring"] ?? -2;
  }
  return rules.mountOffsetByTerrain["Piste/Carving"] ?? 0;
}

function firstCode(value: number, buckets: DINCodeBucket[]): number | null {
  for (const bucket of buckets) {
    const aboveMin = bucket.min === null || bucket.min === undefined ? true : value >= bucket.min;
    const belowMax = bucket.max === null || bucket.max === undefined ? true : value <= bucket.max;
    if (aboveMin && belowMax) return bucket.code;
  }
  return null;
}

function bootSoleBucket(value: number, buckets: DINBootSoleBucket[]): string | null {
  for (const bucket of buckets) {
    const aboveMin = bucket.min === null || bucket.min === undefined ? true : value >= bucket.min;
    const belowMax = bucket.max === null || bucket.max === undefined ? true : value <= bucket.max;
    if (aboveMin && belowMax) return bucket.label;
  }
  return null;
}

function ageAdjustment(age: number, rules: DINAgeAdjustmentRule[]): number {
  for (const rule of rules) {
    const aboveMin = rule.minAge === null || rule.minAge === undefined ? true : age >= rule.minAge;
    const belowMax = rule.maxAge === null || rule.maxAge === undefined ? true : age <= rule.maxAge;
    if (aboveMin && belowMax) return rule.adjustment;
  }
  return 0;
}

function skierLevelAdjustment(
  skillLevel: string,
  dinAggressivenessKey: string | null | undefined,
  profile: DINStandardProfile
): number {
  const key = dinAggressivenessKey?.toLowerCase();
  if (key !== undefined && key !== null && profile.aggressivenessAdjustments[key] !== undefined) {
    return profile.aggressivenessAdjustments[key];
  }
  return (
    profile.skillLevelAdjustments[skillLevel] ??
    profile.aggressivenessAdjustments["moderate"] ??
    1
  );
}

function emptyTrace(standardVersion: string, status: string, reason: string): SkiDINTrace {
  return {
    standardVersion,
    status,
    reason,
    weightCode: null,
    heightCode: null,
    baseCode: null,
    ageAdjustment: null,
    levelAdjustment: null,
    finalCode: null,
    finalCodeLetter: null,
    bslBucket: null,
    tableValue: null,
  };
}

function calculateDINReference(
  height: number,
  weight: number,
  age: number,
  skillLevel: string,
  dinAggressivenessKey: string | null | undefined,
  bootSoleLength: number,
  rules: SkiCalculationRules
): { range: { min: number; max: number } | null; trace: SkiDINTrace } {
  const profile = rules.dinStandardProfile ?? DEFAULT_DIN_PROFILE;
  const weightCode = firstCode(weight, profile.weightCodeBuckets);
  const heightCode = firstCode(height, profile.heightCodeBuckets);
  const bslBucket = bootSoleBucket(bootSoleLength, profile.bootSoleLengthBuckets);

  if (weightCode === null || heightCode === null || bslBucket === null) {
    return {
      range: null,
      trace: emptyTrace(
        profile.standardVersion,
        "out_of_range",
        "Inputs are outside supported ISO 11088 profile ranges."
      ),
    };
  }

  const baseCode = Math.min(weightCode, heightCode);
  const ageAdj = ageAdjustment(age, profile.ageAdjustmentRules);
  const levelAdj = skierLevelAdjustment(skillLevel, dinAggressivenessKey, profile);
  const finalCode = Math.max(
    profile.finalCodeMin,
    Math.min(profile.finalCodeMax, baseCode + ageAdj + levelAdj)
  );

  const codeLetter = profile.codeLetterMap[String(finalCode)];
  if (!codeLetter) {
    return {
      range: null,
      trace: {
        standardVersion: profile.standardVersion,
        status: "out_of_range",
        reason: "Unable to map final skier code to DIN letter.",
        weightCode,
        heightCode,
        baseCode,
        ageAdjustment: ageAdj,
        levelAdjustment: levelAdj,
        finalCode,
        finalCodeLetter: null,
        bslBucket,
        tableValue: null,
      },
    };
  }

  const din = profile.lookupTable[codeLetter]?.[bslBucket];
  if (din === undefined || din === null || din === 0) {
    return {
      range: null,
      trace: {
        standardVersion: profile.standardVersion,
        status: "out_of_range",
        reason: "No DIN value exists for this skier code and BSL bucket.",
        weightCode,
        heightCode,
        baseCode,
        ageAdjustment: ageAdj,
        levelAdjustment: levelAdj,
        finalCode,
        finalCodeLetter: codeLetter,
        bslBucket,
        tableValue: din ?? null,
      },
    };
  }

  const rangeRule = profile.displayRangeRule;
  return {
    range: {
      min: Math.max(rangeRule.floor, din - rangeRule.buffer),
      max: din + rangeRule.buffer,
    },
    trace: {
      standardVersion: profile.standardVersion,
      status: "valid",
      reason: null,
      weightCode,
      heightCode,
      baseCode,
      ageAdjustment: ageAdj,
      levelAdjustment: levelAdj,
      finalCode,
      finalCodeLetter: codeLetter,
      bslBucket,
      tableValue: din,
    },
  };
}

function generateNotes(
  skiLength: number,
  mountOffset: number,
  terrain: string,
  skillLevel: string,
  sizingNotes: string[]
): SkiStanceNotes {
  const skiLengthInt = swiftRound(skiLength);
  let skiLengthNote = `Recommended ski length: ${skiLengthInt}cm.`;
  if (sizingNotes.length > 0) {
    skiLengthNote += " " + sizingNotes.join(" ");
  } else {
    skiLengthNote += ` Optimized for ${terrain.toLowerCase()} terrain.`;
    if (skillLevel === "Beginner") {
      skiLengthNote += " Shorter skis are easier to control and turn.";
    } else if (skillLevel === "Advanced") {
      skiLengthNote += " Longer skis provide more stability at high speeds.";
    }
  }

  let mountNote: string;
  if (mountOffset === 0) {
    mountNote = "Mount bindings at factory recommended line for balanced performance.";
  } else if (mountOffset > 0) {
    mountNote = `Mount ${mountOffset}mm forward of recommended line for quicker turn initiation.`;
  } else {
    mountNote = `Mount ${Math.abs(mountOffset)}mm behind recommended line`;
    if (terrain === "Freeride/Powder" || terrain === "Powder") {
      mountNote += " for better float and tail support in deep snow.";
    } else {
      mountNote += " for more stability.";
    }
  }

  return { mountNote, skiLengthNote, dinDisclaimer: DIN_DISCLAIMER };
}

export function calculateSkiResult(
  input: SkiCalculationInput,
  rules: SkiCalculationRules = DEFAULT_SKI_RULES
): SkiCalculationResult {
  const terrain = safeIndex(rules.terrainOptions, input.terrainFocusIndex) ?? "Piste/Carving";
  const skillLevel = safeIndex(rules.skillLevelOptions, input.skillLevelIndex) ?? "Intermediate";

  const rec = recommendSkiLength(
    input.height,
    input.weight ?? null,
    mapSkillToEngine(skillLevel),
    mapTerrainToEngine(terrain),
    rules
  );
  const skiLength = rec.recommendedCm;

  const mountOffset = calculateMountOffset(terrain, skillLevel, rules);

  let dinRange: { min: number; max: number } | null = null;
  let dinTrace: SkiDINTrace | null;
  if (input.age !== null && input.age !== undefined && input.bootSoleLength !== null && input.bootSoleLength !== undefined) {
    const dinCalc = calculateDINReference(
      input.height,
      input.weight,
      input.age,
      skillLevel,
      input.dinAggressivenessKey,
      input.bootSoleLength,
      rules
    );
    dinRange = dinCalc.range;
    dinTrace = dinCalc.trace;
  } else {
    dinTrace = emptyTrace(
      rules.dinStandardVersion,
      "insufficient_input",
      "Age and boot sole length are required for DIN calculation."
    );
  }

  const notes = generateNotes(skiLength, mountOffset, terrain, skillLevel, rec.notes);

  return {
    skiSetup: {
      skiLengthCm: skiLength,
      mountOffsetMm: mountOffset,
      dinReferenceRange: dinRange,
      dinTrace,
      notes,
    },
    selectedTerrain: terrain,
    selectedSkillLevel: skillLevel,
    appliedRuleset: rules.appliedRuleset ?? BUNDLED_SKI_RULESET,
  };
}
