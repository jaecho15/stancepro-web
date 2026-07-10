import {
  BUNDLED_SNOWBOARD_RULESET,
  type SnowboardCalculationRules,
} from "./types";

// Mirror of SnowboardCalculationRules.bundledDefaults in the iOS app
// (StancePro/Models/CalculationRulesModels.swift). Used as the offline
// fallback when the Supabase ruleset cannot be fetched.
export const DEFAULT_SNOWBOARD_RULES: SnowboardCalculationRules = {
  styles: ["All-Mountain", "Ground-Tricks", "Freeride", "Park", "Powder", "Carving"],
  switchOptions: ["No", "Yes"],
  flexibilityOptions: ["Low", "Medium", "High"],
  coreStrengthOptions: ["Weak", "Moderate", "Strong"],
  skillLevelOptions: ["Beginner", "Intermediate", "Advanced"],
  ridingStyleAdjustments: {
    "All-Mountain": 1.0,
    Freeride: 1.0,
    Carving: 0.95,
    Powder: 0.95,
    "Ground-Tricks": 0.95,
    Park: 1.0,
  },
  bodyFlexWidthMultipliers: {
    Low: 0.98,
    Medium: 1.0,
    High: 1.02,
  },
  coreStrengthWidthMultipliers: {
    Weak: 0.98,
    Moderate: 1.0,
    Strong: 1.02,
  },
  injuryWidthMultiplier: 0.98,
  stanceWidthFromHeightFactor: 0.31,
  stanceWidthFromLegFactor: 0.62,
  bootFlexSlope: 0.005,
  boardFlexSlope: 0.004,
  bindingFlexSlope: 0.003,
  boardLengthHeightFactor: 0.88,
  boardLengthReferenceBMI: 22.5,
  boardLengthWeightAdjustmentSlope: 10.0,
  boardLengthWeightAdjustmentClamp: 5.0,
  boardLengthStyleMultipliers: {
    "All-Mountain": 1.0,
    Freeride: 1.0,
    Carving: 1.02,
    Powder: 0.98,
    "Ground-Tricks": 0.98,
    Park: 0.98,
  },
  bindingAngleProfiles: {
    "Ground-Tricks": {
      frontRange: { min: 12, max: 18 },
      rearRange: { min: -15, max: -9 },
      skillAngles: {
        Beginner: { front: 12, rear: -15 },
        Intermediate: { front: 15, rear: -12 },
        Advanced: { front: 18, rear: -9 },
      },
    },
    Park: {
      frontRange: { min: 9, max: 15 },
      rearRange: { min: -12, max: -9 },
      skillAngles: {
        Beginner: { front: 9, rear: -9 },
        Intermediate: { front: 12, rear: -10 },
        Advanced: { front: 15, rear: -12 },
      },
    },
    "All-Mountain": {
      frontRange: { min: 15, max: 21 },
      rearRange: { min: -12, max: -6 },
      skillAngles: {
        Beginner: { front: 15, rear: -12 },
        Intermediate: { front: 18, rear: -9 },
        Advanced: { front: 21, rear: -6 },
      },
    },
    Freeride: {
      frontRange: { min: 15, max: 21 },
      rearRange: { min: -9, max: 0 },
      skillAngles: {
        Beginner: { front: 15, rear: -9 },
        Intermediate: { front: 18, rear: -5 },
        Advanced: { front: 21, rear: 0 },
      },
    },
    Powder: {
      frontRange: { min: 15, max: 24 },
      rearRange: { min: -3, max: 0 },
      skillAngles: {
        Beginner: { front: 15, rear: -3 },
        Intermediate: { front: 19, rear: -1 },
        Advanced: { front: 24, rear: 0 },
      },
    },
    Carving: {
      frontRange: { min: 18, max: 27 },
      rearRange: { min: 3, max: 9 },
      skillAngles: {
        Beginner: { front: 18, rear: 3 },
        Intermediate: { front: 22, rear: 6 },
        Advanced: { front: 27, rear: 9 },
      },
    },
  },
  carvingStanceProfiles: {
    neutralCarving: {
      widthMultiplier: 1.0,
      rearMax: 0,
      skillAngles: {
        Beginner: { front: 18, rear: -6 },
        Intermediate: { front: 21, rear: -6 },
        Advanced: { front: 24, rear: 0 },
      },
    },
    forwardCarving: {
      widthMultiplier: 0.96,
      rearMax: null,
      skillAngles: {
        Beginner: { front: 24, rear: 6 },
        Intermediate: { front: 27, rear: 9 },
        Advanced: { front: 30, rear: 12 },
      },
    },
  },
  appliedRuleset: BUNDLED_SNOWBOARD_RULESET,
};
