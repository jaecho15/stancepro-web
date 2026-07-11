// Generates the shared input grid for the Swift/TS differential test.
// Usage: node gen_cases.mjs <snowboard|ski> <out.json>
import { writeFileSync } from "node:fs";

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mode = process.argv[2];
const outPath = process.argv[3];
if ((mode !== "snowboard" && mode !== "ski") || !outPath) {
  console.error("usage: node gen_cases.mjs <snowboard|ski> <out.json>");
  process.exit(1);
}

const rand = mulberry32(20260710);
const round1 = (x) => Math.round(x * 10) / 10;

if (mode === "ski") {
  const cases = [];
  const aggr = [null, "conservative", "moderate", "aggressive", "AGGRESSIVE", "bogus"];
  const ages = [null, 8, 25, 45, 55, 70];
  const bsls = [null, 240, 260, 280, 300, 320, 340];

  for (let skillLevelIndex = 0; skillLevelIndex < 3; skillLevelIndex++) {
    for (let terrainFocusIndex = 0; terrainFocusIndex < 5; terrainFocusIndex++) {
      for (const dinAggressivenessKey of aggr) {
        for (const age of ages) {
          for (const bootSoleLength of bsls) {
            const height = round1(140 + rand() * 60);
            cases.push({
              height,
              weight: round1(35 + rand() * 85),
              age,
              skillLevelIndex,
              terrainFocusIndex,
              legLength: round1(height * (0.42 + rand() * 0.13)),
              hipWidth: null,
              bootSoleLength,
              dinAggressivenessKey,
              hasInjury: rand() < 0.2,
            });
          }
        }
      }
    }
  }

  // Edge cases: bucket boundaries, out-of-range inputs, index overflow.
  const base = {
    height: 175,
    weight: 75,
    age: 30,
    skillLevelIndex: 1,
    terrainFocusIndex: 1,
    legLength: 87.5,
    hipWidth: null,
    bootSoleLength: 295,
    dinAggressivenessKey: null,
    hasInjury: false,
  };
  cases.push({ ...base, weight: 9 }); // below weight table
  cases.push({ ...base, weight: 10 });
  cases.push({ ...base, weight: 13 });
  cases.push({ ...base, weight: 13.5 }); // between integer buckets
  cases.push({ ...base, weight: 14 });
  cases.push({ ...base, weight: 94 });
  cases.push({ ...base, weight: 95 });
  cases.push({ ...base, weight: 200 });
  cases.push({ ...base, height: 100 });
  cases.push({ ...base, height: 148 });
  cases.push({ ...base, height: 148.5 });
  cases.push({ ...base, height: 149 });
  cases.push({ ...base, height: 178 });
  cases.push({ ...base, height: 179 });
  cases.push({ ...base, height: 194 });
  cases.push({ ...base, height: 195 });
  cases.push({ ...base, height: 240 });
  cases.push({ ...base, bootSoleLength: 250 });
  cases.push({ ...base, bootSoleLength: 250.5 });
  cases.push({ ...base, bootSoleLength: 251 });
  cases.push({ ...base, bootSoleLength: 330 });
  cases.push({ ...base, bootSoleLength: 331 });
  cases.push({ ...base, bootSoleLength: 100 });
  cases.push({ ...base, bootSoleLength: 400 });
  cases.push({ ...base, age: 9 });
  cases.push({ ...base, age: 10 });
  cases.push({ ...base, age: 50 });
  cases.push({ ...base, age: 51 });
  cases.push({ ...base, age: 0 });
  cases.push({ ...base, age: 100 });
  // Light child + big boot → zero cells in the DIN table.
  cases.push({ ...base, weight: 12, height: 120, age: 6, bootSoleLength: 340 });
  cases.push({ ...base, weight: 20, height: 130, age: 8, bootSoleLength: 320 });
  // Heavy + tiny boot → zero cells at the bottom-left of the table.
  cases.push({ ...base, weight: 110, height: 190, bootSoleLength: 240, dinAggressivenessKey: "aggressive" });
  cases.push({ ...base, skillLevelIndex: 9, terrainFocusIndex: 7 });
  cases.push({ ...base, skillLevelIndex: -1, terrainFocusIndex: -1 });
  cases.push({ ...base, skillLevelIndex: 2, terrainFocusIndex: 2 }); // advanced powder mount
  cases.push({ ...base, skillLevelIndex: 0, terrainFocusIndex: 0 }); // beginner carving mount

  writeFileSync(outPath, JSON.stringify(cases));
  console.log(`generated ${cases.length} ski cases`);
  process.exit(0);
}

const cases = [];
const carvingTypes = [null, "neutralCarving", "forwardCarving"];

for (let styleIndex = 0; styleIndex < 6; styleIndex++) {
  for (let switchIndex = 0; switchIndex < 2; switchIndex++) {
    for (let bodyFlexIndex = 0; bodyFlexIndex < 3; bodyFlexIndex++) {
      for (let coreStrengthIndex = 0; coreStrengthIndex < 3; coreStrengthIndex++) {
        for (let skillLevelIndex = 0; skillLevelIndex < 3; skillLevelIndex++) {
          for (const hasInjury of [false, true]) {
            for (const carvingStanceType of carvingTypes) {
              for (let rep = 0; rep < 2; rep++) {
                const height = round1(150 + rand() * 50);
                cases.push({
                  height,
                  legLength: round1(height * (0.42 + rand() * 0.13)),
                  weight: round1(45 + rand() * 65),
                  styleIndex,
                  switchIndex,
                  bodyFlexIndex,
                  coreStrengthIndex,
                  hasInjury,
                  useHeightForBase: rep === 0,
                  bootFlex: (2 + Math.floor(rand() * 17)) / 2,
                  boardFlex: (2 + Math.floor(rand() * 17)) / 2,
                  bindingFlex: (2 + Math.floor(rand() * 17)) / 2,
                  skillLevelIndex,
                  carvingStanceType,
                });
              }
            }
          }
        }
      }
    }
  }
}

// Edge cases: extremes, unknown carving type, out-of-range indices.
const base = {
  height: 175,
  legLength: 87.5,
  weight: 75,
  styleIndex: 0,
  switchIndex: 0,
  bodyFlexIndex: 1,
  coreStrengthIndex: 1,
  hasInjury: false,
  useHeightForBase: true,
  bootFlex: 5,
  boardFlex: 5,
  bindingFlex: 5,
  skillLevelIndex: 1,
  carvingStanceType: null,
};
cases.push({ ...base, height: 100, legLength: 42, weight: 30 });
cases.push({ ...base, height: 230, legLength: 126.5, weight: 150 });
cases.push({ ...base, bootFlex: 0, boardFlex: 0, bindingFlex: 0 });
cases.push({ ...base, bootFlex: 10, boardFlex: 10, bindingFlex: 10 });
cases.push({ ...base, styleIndex: 5, carvingStanceType: "bogusProfile" });
cases.push({ ...base, styleIndex: 7 });
cases.push({ ...base, switchIndex: 5 });
cases.push({ ...base, bodyFlexIndex: 9, coreStrengthIndex: 9, skillLevelIndex: 9 });
cases.push({ ...base, styleIndex: -1, switchIndex: -1, skillLevelIndex: -1 });

writeFileSync(outPath, JSON.stringify(cases));
console.log(`generated ${cases.length} snowboard cases`);
