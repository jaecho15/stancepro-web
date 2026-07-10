#!/bin/bash
# Differential test: web TS stance engine vs the REAL iOS Swift engine.
# Compiles the unmodified iOS source files with minimal stubs, runs both
# engines over the same ~3.9k-case grid, and compares all output fields.
# Run whenever lib/stance/ or the iOS engine/ruleset changes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
IOS_ROOT="${IOS_ROOT:-$WEB_ROOT/../StancePro/StancePro}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cp "$IOS_ROOT/Services/StanceCalculationService.swift" \
   "$IOS_ROOT/Models/CalculationRulesModels.swift" \
   "$SCRIPT_DIR/stubs.swift" "$SCRIPT_DIR/main.swift" "$WORK/"

echo "compiling swift harness (real iOS engine files)..."
xcrun swiftc -O "$WORK/CalculationRulesModels.swift" "$WORK/StanceCalculationService.swift" \
  "$WORK/stubs.swift" "$WORK/main.swift" -o "$WORK/harness"

echo "compiling ts engine..."
(cd "$WEB_ROOT" && npx tsc lib/stance/engine.ts lib/stance/default-rules.ts lib/stance/types.ts \
  --outDir "$WORK/tslib" --module commonjs --target es2022 --skipLibCheck --strict)

node "$SCRIPT_DIR/gen_cases.mjs" "$WORK/cases.json"

"$WORK/harness" "$WORK/cases.json" bundled "$WORK/swift_out.json"
node "$SCRIPT_DIR/run_ts.mjs" "$WORK/tslib" "$WORK/cases.json" bundled "$WORK/ts_out.json"
node "$SCRIPT_DIR/compare.mjs" "$WORK/swift_out.json" "$WORK/ts_out.json" "$WORK/cases.json"

# Optionally test against a rules JSON (e.g. the active Supabase payload):
#   ./run.sh path/to/rules.json
if [[ $# -ge 1 ]]; then
  "$WORK/harness" "$WORK/cases.json" "$1" "$WORK/swift_remote.json"
  node "$SCRIPT_DIR/run_ts.mjs" "$WORK/tslib" "$WORK/cases.json" "$1" "$WORK/ts_remote.json"
  node "$SCRIPT_DIR/compare.mjs" "$WORK/swift_remote.json" "$WORK/ts_remote.json" "$WORK/cases.json"
fi
