import type { AppliedCalculationRuleset } from "./types";

// TypeScript mirror of the iOS ski calculation models
// (CalculationRulesModels.swift + SkiStanceResult.swift).

export interface DINCodeBucket {
  min?: number | null;
  max?: number | null;
  code: number;
}

export interface DINBootSoleBucket {
  label: string;
  min?: number | null;
  max?: number | null;
}

export interface DINAgeAdjustmentRule {
  minAge?: number | null;
  maxAge?: number | null;
  adjustment: number;
}

export interface DINStandardProfile {
  standardVersion: string;
  profileVersion: string;
  weightCodeBuckets: DINCodeBucket[];
  heightCodeBuckets: DINCodeBucket[];
  bootSoleLengthBuckets: DINBootSoleBucket[];
  ageAdjustmentRules: DINAgeAdjustmentRule[];
  skillLevelAdjustments: Record<string, number>;
  aggressivenessAdjustments: Record<string, number>;
  finalCodeMin: number;
  finalCodeMax: number;
  codeLetterMap: Record<string, string>;
  lookupTable: Record<string, Record<string, number>>;
  displayRangeRule: { buffer: number; floor: number };
}

export interface SkiCalculationRules {
  terrainOptions: string[];
  skillLevelOptions: string[];
  dinAggressivenessKeys: string[];
  dinStandardVersion: string;
  dinLookupTable: Record<string, Record<string, number>>;
  dinStandardProfile?: DINStandardProfile | null;
  skiLengthBaseFactor: number;
  referenceWeightFloor: number;
  referenceWeightHeightOffset: number;
  referenceWeightHeightSlope: number;
  weightAdjustmentSlope: number;
  weightAdjustmentClamp: number;
  skillLengthAdjustments: Record<string, number>;
  terrainLengthAdjustments: Record<string, number>;
  skillEnvelopeMinOffsets: Record<string, number>;
  skillEnvelopeMaxOffsets: Record<string, number>;
  mountOffsetByTerrain: Record<string, number>;
  advancedPowderMountOffset: number;
  appliedRuleset?: AppliedCalculationRuleset;
}

export interface SkiCalculationInput {
  height: number;
  weight: number;
  age?: number | null;
  skillLevelIndex: number;
  terrainFocusIndex: number;
  legLength?: number | null;
  hipWidth?: number | null;
  bootSoleLength?: number | null;
  dinAggressivenessKey?: string | null;
  hasInjury: boolean;
}

export interface SkiDINTrace {
  standardVersion: string;
  status: string;
  reason: string | null;
  weightCode: number | null;
  heightCode: number | null;
  baseCode: number | null;
  ageAdjustment: number | null;
  levelAdjustment: number | null;
  finalCode: number | null;
  finalCodeLetter: string | null;
  bslBucket: string | null;
  tableValue: number | null;
}

export interface SkiStanceNotes {
  mountNote: string;
  skiLengthNote: string;
  dinDisclaimer: string;
}

export interface SkiStanceResult {
  skiLengthCm: number;
  mountOffsetMm: number;
  dinReferenceRange: { min: number; max: number } | null;
  dinTrace: SkiDINTrace | null;
  notes: SkiStanceNotes;
}

export interface SkiCalculationResult {
  skiSetup: SkiStanceResult;
  selectedTerrain: string;
  selectedSkillLevel: string;
  appliedRuleset: AppliedCalculationRuleset;
}

export interface SkiLengthRecommendation {
  recommendedCm: number;
  minCm: number;
  maxCm: number;
  rawCm: number;
  notes: string[];
}
