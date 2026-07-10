// TypeScript mirror of StancePro iOS CalculationRulesModels.swift (snowboard subset).
// Field names match the Supabase `calc_rule_sets.payload` JSON exactly.

export interface AppliedCalculationRuleset {
  id: string | null;
  version: string;
  hash: string;
}

export const BUNDLED_SNOWBOARD_RULESET: AppliedCalculationRuleset = {
  id: null,
  version: "bundled-snowboard-v1",
  hash: "bundled-snowboard-v1",
};

export interface BindingAngleRange {
  min: number;
  max: number;
}

export interface BindingAnglePair {
  front: number;
  rear: number;
}

export interface BindingAngleProfile {
  frontRange: BindingAngleRange;
  rearRange: BindingAngleRange;
  skillAngles: Record<string, BindingAnglePair>;
}

export interface CarvingStanceRuleProfile {
  widthMultiplier: number;
  rearMax?: number | null;
  skillAngles: Record<string, BindingAnglePair>;
}

export interface SnowboardCalculationRules {
  styles: string[];
  switchOptions: string[];
  flexibilityOptions: string[];
  coreStrengthOptions: string[];
  skillLevelOptions: string[];
  ridingStyleAdjustments: Record<string, number>;
  bodyFlexWidthMultipliers: Record<string, number>;
  coreStrengthWidthMultipliers: Record<string, number>;
  injuryWidthMultiplier: number;
  stanceWidthFromHeightFactor: number;
  stanceWidthFromLegFactor: number;
  bootFlexSlope: number;
  boardFlexSlope: number;
  bindingFlexSlope: number;
  boardLengthHeightFactor: number;
  boardLengthReferenceBMI: number;
  boardLengthWeightAdjustmentSlope: number;
  boardLengthWeightAdjustmentClamp: number;
  boardLengthStyleMultipliers: Record<string, number>;
  bindingAngleProfiles?: Record<string, BindingAngleProfile>;
  carvingStanceProfiles?: Record<string, CarvingStanceRuleProfile>;
  appliedRuleset?: AppliedCalculationRuleset;
}

export interface SnowboardCalculationInput {
  height: number;
  legLength: number;
  weight: number;
  styleIndex: number;
  switchIndex: number;
  bodyFlexIndex: number;
  coreStrengthIndex: number;
  hasInjury: boolean;
  useHeightForBase: boolean;
  bootFlex: number;
  boardFlex: number;
  bindingFlex: number;
  skillLevelIndex: number;
  carvingStanceType?: string | null;
}

export interface SnowboardCalculationResult {
  width: number;
  frontAngle: string;
  rearAngle: string;
  method: string;
  boardLength: number;
  suggestedModels: string[];
  highbackLean: string;
  appliedRuleset: AppliedCalculationRuleset;
  carvingStanceType?: string | null;
}
