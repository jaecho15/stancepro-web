// Compares Swift and TS harness outputs case-by-case.
import { readFileSync } from "node:fs";

const swift = JSON.parse(readFileSync(process.argv[2], "utf8"));
const ts = JSON.parse(readFileSync(process.argv[3], "utf8"));
const cases = JSON.parse(readFileSync(process.argv[4], "utf8"));

if (swift.length !== ts.length) {
  console.error(`length mismatch: swift=${swift.length} ts=${ts.length}`);
  process.exit(1);
}

const fields = ["width", "front", "rear", "method", "boardLength", "highback", "shape"];
let mismatches = 0;
for (let i = 0; i < swift.length; i++) {
  for (const f of fields) {
    if (swift[i][f] !== ts[i][f]) {
      mismatches++;
      if (mismatches <= 10) {
        console.error(
          `case ${i} field ${f}: swift=${JSON.stringify(swift[i][f])} ts=${JSON.stringify(ts[i][f])}\n  input: ${JSON.stringify(cases[i])}`
        );
      }
    }
  }
}

if (mismatches > 0) {
  console.error(`FAIL: ${mismatches} field mismatches across ${swift.length} cases`);
  process.exit(1);
}
console.log(`PASS: ${swift.length} cases, all ${fields.length} fields identical`);
