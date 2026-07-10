// Runs the web TS engine (compiled to CJS by tsc) over the shared case grid.
// Usage: node run_ts.mjs <compiled-lib-dir> <cases.json> <rules.json|bundled> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const libDir = path.resolve(process.argv[2]);
const engine = require(path.join(libDir, "engine.js"));
const defaults = require(path.join(libDir, "default-rules.js"));

const cases = JSON.parse(readFileSync(process.argv[3], "utf8"));
const rules =
  process.argv[4] === "bundled"
    ? defaults.DEFAULT_SNOWBOARD_RULES
    : JSON.parse(readFileSync(process.argv[4], "utf8"));

const outputs = cases.map((input) => {
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

writeFileSync(process.argv[5], JSON.stringify(outputs));
console.log(`ts harness: ${outputs.length} cases`);
