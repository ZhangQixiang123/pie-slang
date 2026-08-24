#!/usr/bin/env bash
#
# One-command verification of the artifact:
#   1. Hardware preflight (hard-fails on unsupported hardware).
#   2. Offline step-level evaluation on the 13-step even/odd holdout.
# Expected result: 13/13 exact-match (100%).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export PIE_BASE_MODEL="$DIR/base-model"

python "$DIR/preflight.py"

echo ""
echo "Running offline holdout evaluation (expected: 13/13 exact-match) ..."
python "$DIR/evaluate_offline.py" \
  --adapter "$DIR/adapter" \
  --test-proofs "$DIR/test/test-even-or-odd-holdout.jsonl" \
  --verbose
