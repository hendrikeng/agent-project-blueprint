#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

./scripts/check-template-placeholders.sh
node --run context:compile
node --run eval:refresh
node --run verify:full
node --run bootstrap:cleanup

echo "[bootstrap-verify] passed"
