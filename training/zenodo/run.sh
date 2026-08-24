#!/usr/bin/env bash
#
# Start the Pie tactic-prediction server from the self-contained bundle.
# Runs the hardware preflight first; if the machine is unsupported it prints a
# clear message and exits WITHOUT attempting to load the model.
#
#   ./run.sh            # serve on port 8000
#   PORT=9000 ./run.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8000}"

# Fully offline / self-contained: use the vendored base model, never the network.
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export PIE_BASE_MODEL="$DIR/base-model"

# 1. Hardware preflight (hard-fails on unsupported hardware).
python "$DIR/preflight.py"

# 2. Serve.
echo "Starting tactic server on http://localhost:$PORT  (Ctrl+C to stop)"
python "$DIR/serve.py" --adapter "$DIR/adapter" --port "$PORT"
