// Runs the web TS engine (compiled to CJS by tsc) over the shared case grid.
// Usage: node run_ts.mjs <snowboard|ski> <compiled-lib-dir> <cases.json> <rules.json|bundled> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const mode = process.argv[2];
if (mode !== "snowboard" && mode !== "ski") {
  console.error("usage: node run_ts.mjs <snowboard|ski> <lib-dir> <cases.json> <rules.json|bundled> <out.json>");
  process.exit(1);
}
const libDir = path.resolve(process.argv[3]);
const cases = JSON.parse(readFileSync(process.argv[4], "utf8"));

let outputs;
if (mode === "snowboard") {
  const engine = require(path.join(libDir, "engine.js"));
  const defaults = require(path.join(libDir, "default-rules.js"));
  const rules =
    process.argv[5] === "bundled"
      ? defaults.DEFAULT_SNOWBOARD_RULES
      : JSON.parse(readFileSync(process.argv[5], "utf8"));
  outputs = cases.map((input) => {
    const r = engine.calculateResult(input, rules);
    return {
      width: r.width,
      front: r.frontAngle,
      rear: r.rearAngle,
      method: r.method,
      boardLength: r.boardLength,
      highback: r.highbackLean,
      shape: engine.recommendBoardShape(input.styleIndex, input.switchIndex, input.skillLevelIndex),
    };
  });
} else {
  const engine = require(path.join(libDir, "ski-engine.js"));
  const defaults = require(path.join(libDir, "ski-default-rules.js"));
  const rules =
    process.argv[5] === "bundled"
      ? defaults.DEFAULT_SKI_RULES
      : JSON.parse(readFileSync(process.argv[5], "utf8"));
  outputs = cases.map((input) => {
    const r = engine.calculateSkiResult(input, rules);
    const setup = r.skiSetup;
    return {
      skiLengthCm: setup.skiLengthCm,
      mountOffsetMm: setup.mountOffsetMm,
      dinMin: setup.dinReferenceRange?.min ?? null,
      dinMax: setup.dinReferenceRange?.max ?? null,
      status: setup.dinTrace?.status ?? null,
      reason: setup.dinTrace?.reason ?? null,
      weightCode: setup.dinTrace?.weightCode ?? null,
      heightCode: setup.dinTrace?.heightCode ?? null,
      baseCode: setup.dinTrace?.baseCode ?? null,
      ageAdjustment: setup.dinTrace?.ageAdjustment ?? null,
      levelAdjustment: setup.dinTrace?.levelAdjustment ?? null,
      finalCode: setup.dinTrace?.finalCode ?? null,
      finalCodeLetter: setup.dinTrace?.finalCodeLetter ?? null,
      bslBucket: setup.dinTrace?.bslBucket ?? null,
      tableValue: setup.dinTrace?.tableValue ?? null,
      mountNote: setup.notes.mountNote,
      skiLengthNote: setup.notes.skiLengthNote,
      selectedTerrain: r.selectedTerrain,
      selectedSkillLevel: r.selectedSkillLevel,
    };
  });
}

writeFileSync(process.argv[6], JSON.stringify(outputs));
console.log(`ts harness (${mode}): ${outputs.length} cases`);
