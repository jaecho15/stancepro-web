import type { DINStandardProfile, SkiCalculationRules } from "./ski-types";

// Mirror of SkiCalculationRules.bundledDefaults / DINStandardProfile.bundledDefault
// in the iOS app (CalculationRulesModels.swift + SkiStanceCalculationService's
// dinLookupTable). Offline fallback when the Supabase ruleset can't be fetched.

export const BUNDLED_SKI_RULESET = {
  id: null,
  version: "bundled-ski-v1",
  hash: "bundled-ski-v1",
} as const;

// ISO 11088 reference table (letter code × boot-sole-length bucket → DIN).
// ⚠️ Estimates only — bindings must be set by a certified technician.
export const DIN_LOOKUP_TABLE: Record<string, Record<string, number>> = {
  A: { "<=250": 0.75, "251-270": 0.75, "271-290": 0, "291-310": 0, "311-330": 0, ">330": 0 },
  B: { "<=250": 1.0, "251-270": 1.0, "271-290": 0.75, "291-310": 0, "311-330": 0, ">330": 0 },
  C: { "<=250": 1.5, "251-270": 1.25, "271-290": 1.0, "291-310": 0, "311-330": 0, ">330": 0 },
  D: { "<=250": 1.75, "251-270": 1.5, "271-290": 1.5, "291-310": 1.25, "311-330": 0, ">330": 0 },
  E: { "<=250": 2.25, "251-270": 2.0, "271-290": 1.75, "291-310": 1.5, "311-330": 1.25, ">330": 0 },
  F: { "<=250": 2.75, "251-270": 2.5, "271-290": 2.25, "291-310": 2.0, "311-330": 1.75, ">330": 1.75 },
  G: { "<=250": 3.5, "251-270": 3.0, "271-290": 2.75, "291-310": 2.5, "311-330": 2.25, ">330": 2.0 },
  H: { "<=250": 0, "251-270": 3.5, "271-290": 3.0, "291-310": 3.0, "311-330": 2.75, ">330": 2.5 },
  I: { "<=250": 0, "251-270": 4.5, "271-290": 4.0, "291-310": 3.5, "311-330": 3.25, ">330": 3.0 },
  J: { "<=250": 0, "251-270": 5.5, "271-290": 5.0, "291-310": 4.5, "311-330": 4.0, ">330": 3.5 },
  K: { "<=250": 0, "251-270": 6.5, "271-290": 6.0, "291-310": 5.5, "311-330": 5.0, ">330": 4.5 },
  L: { "<=250": 0, "251-270": 7.5, "271-290": 7.0, "291-310": 6.5, "311-330": 6.0, ">330": 5.5 },
  M: { "<=250": 0, "251-270": 0, "271-290": 8.5, "291-310": 8.0, "311-330": 7.0, ">330": 6.5 },
  N: { "<=250": 0, "251-270": 0, "271-290": 10.0, "291-310": 9.5, "311-330": 8.5, ">330": 8.0 },
  O: { "<=250": 0, "251-270": 0, "271-290": 11.5, "291-310": 11.0, "311-330": 10.0, ">330": 9.5 },
};

export const DEFAULT_DIN_PROFILE: DINStandardProfile = {
  standardVersion: "ISO_11088_2006_PROFILE_V1",
  profileVersion: "din-profile-v1",
  weightCodeBuckets: [
    { min: 10, max: 13, code: 1 },
    { min: 14, max: 17, code: 2 },
    { min: 18, max: 21, code: 3 },
    { min: 22, max: 25, code: 4 },
    { min: 26, max: 30, code: 5 },
    { min: 31, max: 35, code: 6 },
    { min: 36, max: 41, code: 7 },
    { min: 42, max: 48, code: 8 },
    { min: 49, max: 57, code: 9 },
    { min: 58, max: 66, code: 10 },
    { min: 67, max: 78, code: 11 },
    { min: 79, max: 94, code: 12 },
    { min: 95, max: null, code: 13 },
  ],
  heightCodeBuckets: [
    { min: 0, max: 148, code: 8 },
    { min: 149, max: 157, code: 9 },
    { min: 158, max: 166, code: 10 },
    { min: 167, max: 178, code: 11 },
    { min: 179, max: 194, code: 12 },
    { min: 195, max: null, code: 13 },
  ],
  bootSoleLengthBuckets: [
    { label: "<=250", min: null, max: 250 },
    { label: "251-270", min: 251, max: 270 },
    { label: "271-290", min: 271, max: 290 },
    { label: "291-310", min: 291, max: 310 },
    { label: "311-330", min: 311, max: 330 },
    { label: ">330", min: 331, max: null },
  ],
  ageAdjustmentRules: [
    { minAge: null, maxAge: 9, adjustment: -1 },
    { minAge: 51, maxAge: null, adjustment: -1 },
  ],
  skillLevelAdjustments: {
    Beginner: 0,
    Intermediate: 1,
    Advanced: 2,
  },
  aggressivenessAdjustments: {
    conservative: 0,
    moderate: 1,
    aggressive: 2,
  },
  finalCodeMin: 1,
  finalCodeMax: 15,
  codeLetterMap: {
    "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
    "6": "F", "7": "G", "8": "H", "9": "I", "10": "J",
    "11": "K", "12": "L", "13": "M", "14": "N", "15": "O",
  },
  lookupTable: DIN_LOOKUP_TABLE,
  displayRangeRule: { buffer: 0.5, floor: 0.75 },
};

export const DEFAULT_SKI_RULES: SkiCalculationRules = {
  terrainOptions: ["Piste/Carving", "All-Mountain", "Freeride/Powder", "Freestyle/Park", "Touring"],
  skillLevelOptions: ["Beginner", "Intermediate", "Advanced"],
  dinAggressivenessKeys: ["conservative", "moderate", "aggressive"],
  dinStandardVersion: "ISO_11088_2006_PROFILE_V1",
  dinLookupTable: DIN_LOOKUP_TABLE,
  dinStandardProfile: DEFAULT_DIN_PROFILE,
  skiLengthBaseFactor: 0.945,
  referenceWeightFloor: 45.0,
  referenceWeightHeightOffset: 100.0,
  referenceWeightHeightSlope: 0.9,
  weightAdjustmentSlope: 0.2,
  weightAdjustmentClamp: 4.0,
  skillLengthAdjustments: {
    Beginner: -4,
    Intermediate: 0,
    Advanced: 5,
  },
  terrainLengthAdjustments: {
    "Piste/Carving": 2,
    "All-Mountain": 1,
    "Freeride/Powder": 5,
    "Freestyle/Park": -4,
    Touring: -2,
  },
  skillEnvelopeMinOffsets: {
    Beginner: -18,
    Intermediate: -12,
    Advanced: -8,
  },
  skillEnvelopeMaxOffsets: {
    Beginner: -6,
    Intermediate: 2,
    Advanced: 6,
  },
  mountOffsetByTerrain: {
    "Piste/Carving": 0,
    "All-Mountain": -2,
    "Freeride/Powder": -6,
    "Freestyle/Park": 2,
    Touring: -2,
  },
  advancedPowderMountOffset: -8,
  appliedRuleset: BUNDLED_SKI_RULESET,
};
