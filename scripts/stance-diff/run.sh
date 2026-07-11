#!/bin/bash
# Differential test: web TS stance engines vs the REAL iOS Swift engines
# (snowboard + ski). Compiles the unmodified iOS source files with minimal
# stubs, runs both engines over the same case grids, and compares all output
# fields. Run whenever lib/stance/ or the iOS engines/rulesets change.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
IOS_ROOT="${IOS_ROOT:-$WEB_ROOT/../StancePro/StancePro}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cp "$IOS_ROOT/Services/StanceCalculationService.swift" \
   "$IOS_ROOT/Services/SkiStanceCalculationService.swift" \
   "$IOS_ROOT/Models/CalculationRulesModels.swift" \
   "$IOS_ROOT/Models/SkiStanceResult.swift" \
   "$SCRIPT_DIR/stubs.swift" "$SCRIPT_DIR/main.swift" "$WORK/"

echo "compiling swift harness (real iOS engine files)..."
xcrun swiftc -O "$WORK/CalculationRulesModels.swift" "$WORK/StanceCalculationService.swift" \
  "$WORK/SkiStanceCalculationService.swift" "$WORK/SkiStanceResult.swift" \
  "$WORK/stubs.swift" "$WORK/main.swift" -o "$WORK/harness"

echo "compiling ts engine..."
(cd "$WEB_ROOT" && npx tsc lib/stance/engine.ts lib/stance/default-rules.ts lib/stance/types.ts \
  lib/stance/ski-engine.ts lib/stance/ski-default-rules.ts lib/stance/ski-types.ts \
  --outDir "$WORK/tslib" --module commonjs --target es2022 --skipLibCheck --strict)

for MODE in snowboard ski; do
  node "$SCRIPT_DIR/gen_cases.mjs" "$MODE" "$WORK/cases_$MODE.json"
  "$WORK/harness" "$MODE" "$WORK/cases_$MODE.json" bundled "$WORK/swift_$MODE.json"
  node "$SCRIPT_DIR/run_ts.mjs" "$MODE" "$WORK/tslib" "$WORK/cases_$MODE.json" bundled "$WORK/ts_$MODE.json"
  echo "-- $MODE --"
  node "$SCRIPT_DIR/compare.mjs" "$WORK/swift_$MODE.json" "$WORK/ts_$MODE.json" "$WORK/cases_$MODE.json"
done

# Optionally test against a rules JSON (e.g. the active Supabase payload):
#   ./run.sh <snowboard|ski> path/to/rules.json
if [[ $# -ge 2 ]]; then
  "$WORK/harness" "$1" "$WORK/cases_$1.json" "$2" "$WORK/swift_remote.json"
  node "$SCRIPT_DIR/run_ts.mjs" "$1" "$WORK/tslib" "$WORK/cases_$1.json" "$2" "$WORK/ts_remote.json"
  node "$SCRIPT_DIR/compare.mjs" "$WORK/swift_remote.json" "$WORK/ts_remote.json" "$WORK/cases_$1.json"
fi
