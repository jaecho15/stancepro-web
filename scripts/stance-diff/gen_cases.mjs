// Generates the shared input grid for the Swift/TS differential test.
import { writeFileSync } from "node:fs";

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260710);
const round1 = (x) => Math.round(x * 10) / 10;

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

writeFileSync(process.argv[2], JSON.stringify(cases));
console.log(`generated ${cases.length} cases`);
